mod repository;

use std::{collections::HashMap, env, sync::Arc, time::Duration};

use aes_gcm::{
    aead::{Aead, KeyInit},
    Aes256Gcm, Nonce,
};
use anyhow::{anyhow, Context};
use base64::Engine;
use deadpool_redis::redis;
use repository::BotRunnerRepository;
use serde::Deserialize;
use sqlx::postgres::PgPoolOptions;
use tokio::sync::{Mutex, Semaphore};
use tonic::transport::Channel;
use uuid::Uuid;

#[derive(Clone)]
struct AppState {
    repository: BotRunnerRepository,
    redis_pool: deadpool_redis::Pool,
    telegram_http: reqwest::Client,
    game_client: proto::richcrab::v1::game_service_client::GameServiceClient<Channel>,
    encryption_key: String,
    queue: QueueConfig,
    limits: Limits,
    default_quiz_id: String,
    public_base_url: String,
    per_bot_semaphores: Arc<Mutex<HashMap<String, Arc<Semaphore>>>>,
}

#[derive(Clone)]
struct QueueConfig {
    group: String,
    consumer: String,
    partitions: usize,
    stream_prefix: String,
    dead_letter_stream: String,
    max_attempts: u32,
}

#[derive(Clone)]
struct Limits {
    global: Arc<Semaphore>,
    per_bot: usize,
}

#[derive(Debug, Deserialize)]
struct TelegramUpdate {
    message: Option<TelegramMessage>,
}

#[derive(Debug, Deserialize)]
struct TelegramMessage {
    chat: TelegramChat,
    text: Option<String>,
}

#[derive(Debug, Deserialize)]
struct TelegramChat {
    id: i64,
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    shared::observability::init_tracing("bot_runner");
    shared::observability::init_metrics();

    let database_url = env::var(shared::config::DATABASE_URL)?;
    let redis_url = env::var(shared::config::REDIS_URL)?;
    let migrations_dir = env::var(shared::config::MIGRATIONS_DIR)
        .unwrap_or_else(|_| "/app/richcrab/migrations".to_string());

    let pool = PgPoolOptions::new()
        .max_connections(5)
        .connect(&database_url)
        .await?;
    shared::db::run_migrations(&pool, &migrations_dir).await?;

    let redis_cfg = deadpool_redis::Config::from_url(redis_url);
    let redis_pool = redis_cfg.create_pool(Some(deadpool_redis::Runtime::Tokio1))?;

    let queue = QueueConfig {
        group: env::var("BOT_QUEUE_GROUP").unwrap_or_else(|_| "bot_runner".to_string()),
        consumer: env::var("BOT_QUEUE_CONSUMER")
            .unwrap_or_else(|_| format!("runner-{}", Uuid::new_v4().simple())),
        partitions: env::var("BOT_QUEUE_PARTITIONS")
            .ok()
            .and_then(|v| v.parse::<usize>().ok())
            .unwrap_or(16)
            .max(1),
        stream_prefix: env::var("BOT_QUEUE_STREAM_PREFIX")
            .unwrap_or_else(|_| "bot_updates".to_string()),
        dead_letter_stream: env::var("BOT_DLQ_STREAM")
            .unwrap_or_else(|_| "bot_updates:dlq".to_string()),
        max_attempts: env::var("BOT_QUEUE_MAX_ATTEMPTS")
            .ok()
            .and_then(|v| v.parse::<u32>().ok())
            .unwrap_or(5),
    };

    let game_target = env::var(shared::config::SERVICE_ADDR_GAME)
        .unwrap_or_else(|_| "0.0.0.0:50051".to_string())
        .replace("0.0.0.0", "127.0.0.1");

    let app = AppState {
        repository: BotRunnerRepository::new(pool),
        redis_pool,
        telegram_http: reqwest::Client::new(),
        game_client: proto::richcrab::v1::game_service_client::GameServiceClient::connect(format!(
            "http://{game_target}"
        ))
        .await?,
        encryption_key: env::var(shared::config::ENCRYPTION_KEY)?,
        queue,
        limits: Limits {
            global: Arc::new(Semaphore::new(
                env::var("BOT_RUNNER_GLOBAL_LIMIT")
                    .ok()
                    .and_then(|v| v.parse::<usize>().ok())
                    .unwrap_or(64),
            )),
            per_bot: env::var("BOT_RUNNER_PER_BOT_LIMIT")
                .ok()
                .and_then(|v| v.parse::<usize>().ok())
                .unwrap_or(1),
        },
        default_quiz_id: env::var("BOT_DEFAULT_QUIZ_ID")
            .unwrap_or_else(|_| "telegram-default-quiz".to_string()),
        public_base_url: env::var("GW_PUBLIC_BASE_URL")
            .unwrap_or_else(|_| "http://gateway:8080".to_string()),
        per_bot_semaphores: Arc::new(Mutex::new(HashMap::new())),
    };

    ensure_consumer_groups(&app).await?;
    run_loop(app).await
}

async fn ensure_consumer_groups(state: &AppState) -> anyhow::Result<()> {
    let mut conn = state.redis_pool.get().await?;
    for partition in 0..state.queue.partitions {
        let stream = format!("{}:{}", state.queue.stream_prefix, partition);
        let mut cmd = redis::cmd("XGROUP");
        cmd.arg("CREATE")
            .arg(stream)
            .arg(&state.queue.group)
            .arg("$")
            .arg("MKSTREAM");
        let result = cmd.query_async::<String>(&mut conn).await;
        if let Err(err) = result {
            let message = err.to_string();
            if !message.contains("BUSYGROUP") {
                return Err(err.into());
            }
        }
    }
    Ok(())
}

async fn run_loop(state: AppState) -> anyhow::Result<()> {
    loop {
        if state.limits.global.available_permits() == 0 {
            tokio::time::sleep(Duration::from_millis(25)).await;
            continue;
        }

        let entries = read_entries(&state).await?;
        if entries.is_empty() {
            continue;
        }

        for entry in entries {
            let state_cloned = state.clone();
            tokio::spawn(async move {
                if let Err(err) = process_entry(state_cloned, entry).await {
                    tracing::error!(error = %err, "runner failed to process entry");
                }
            });
        }
    }
}

#[derive(Debug, Clone)]
struct QueueEntry {
    stream: String,
    entry_id: String,
    bot_id: String,
    update_id: i64,
    payload: String,
    enqueued_at_ms: i64,
    attempt: u32,
}

async fn read_entries(state: &AppState) -> anyhow::Result<Vec<QueueEntry>> {
    let mut conn = state.redis_pool.get().await?;
    let streams: Vec<String> = (0..state.queue.partitions)
        .map(|partition| format!("{}:{}", state.queue.stream_prefix, partition))
        .collect();

    let mut cmd = redis::cmd("XREADGROUP");
    cmd.arg("GROUP")
        .arg(&state.queue.group)
        .arg(&state.queue.consumer)
        .arg("COUNT")
        .arg(32)
        .arg("BLOCK")
        .arg(1000)
        .arg("STREAMS");
    for stream in &streams {
        cmd.arg(stream);
    }
    for _ in &streams {
        cmd.arg(">");
    }

    let response = cmd.query_async::<redis::Value>(&mut conn).await?;
    parse_xreadgroup(response)
}

fn parse_xreadgroup(value: redis::Value) -> anyhow::Result<Vec<QueueEntry>> {
    let mut out = Vec::new();
    let redis::Value::Array(streams) = value else {
        return Ok(out);
    };

    for stream_item in streams {
        let redis::Value::Array(parts) = stream_item else {
            continue;
        };
        if parts.len() != 2 {
            continue;
        }
        let stream_name = redis_value_to_string(parts[0].clone())?;
        let redis::Value::Array(entries) = &parts[1] else {
            continue;
        };
        for entry in entries {
            let redis::Value::Array(kv) = entry else {
                continue;
            };
            if kv.len() != 2 {
                continue;
            }
            let entry_id = redis_value_to_string(kv[0].clone())?;
            let redis::Value::Array(fields) = &kv[1] else {
                continue;
            };
            let mut map = HashMap::new();
            for pair in fields.chunks(2) {
                if pair.len() == 2 {
                    map.insert(
                        redis_value_to_string(pair[0].clone())?,
                        redis_value_to_string(pair[1].clone())?,
                    );
                }
            }

            let Some(bot_id) = map.get("bot_id").cloned() else {
                continue;
            };
            let Some(payload) = map.get("payload").cloned() else {
                continue;
            };
            let update_id = map
                .get("update_id")
                .and_then(|v| v.parse::<i64>().ok())
                .unwrap_or_default();
            let enqueued_at_ms = map
                .get("enqueued_at_ms")
                .and_then(|v| v.parse::<i64>().ok())
                .unwrap_or_default();
            let attempt = map
                .get("attempt")
                .and_then(|v| v.parse::<u32>().ok())
                .unwrap_or_default();

            out.push(QueueEntry {
                stream: stream_name.clone(),
                entry_id,
                bot_id,
                update_id,
                payload,
                enqueued_at_ms,
                attempt,
            });
        }
    }
    Ok(out)
}

fn redis_value_to_string(value: redis::Value) -> anyhow::Result<String> {
    match value {
        redis::Value::BulkString(v) => Ok(String::from_utf8(v)?),
        redis::Value::SimpleString(v) => Ok(v),
        redis::Value::Int(v) => Ok(v.to_string()),
        _ => Err(anyhow!("unsupported redis value")),
    }
}

async fn process_entry(state: AppState, entry: QueueEntry) -> anyhow::Result<()> {
    let global_permit = state.limits.global.clone().acquire_owned().await?;
    let bot_semaphore = get_bot_semaphore(&state, &entry.bot_id).await;
    let _bot_permit = bot_semaphore.acquire().await?;

    let metrics = shared::observability::init_metrics();
    let lag_seconds = (chrono::Utc::now().timestamp_millis() - entry.enqueued_at_ms).max(0) / 1000;
    metrics
        .queue_lag_seconds
        .with_label_values(&[&entry.stream])
        .set(lag_seconds);

    let idempotency_key = format!(
        "bot_runner:idempotency:{}:{}",
        entry.bot_id, entry.update_id
    );
    if !set_once(&state.redis_pool, &idempotency_key, 86_400).await? {
        ack(&state, &entry).await?;
        drop(global_permit);
        return Ok(());
    }

    let started = std::time::Instant::now();
    let result = handle_update(&state, &entry).await;

    match result {
        Ok(command_name) => {
            metrics
                .tg_updates_total
                .with_label_values(&["processed"])
                .inc();
            metrics
                .bot_update_latency_ms
                .with_label_values(&[&entry.bot_id, command_name])
                .observe(started.elapsed().as_millis() as f64);
            ack(&state, &entry).await?;
        }
        Err(err) => {
            metrics
                .bot_runner_errors_total
                .with_label_values(&[&entry.bot_id, "handler"])
                .inc();
            delete_key(&state.redis_pool, &idempotency_key).await?;
            retry_or_dead_letter(&state, &entry, &err.to_string()).await?;
        }
    }

    drop(global_permit);
    Ok(())
}

async fn get_bot_semaphore(state: &AppState, bot_id: &str) -> Arc<Semaphore> {
    let mut guard = state.per_bot_semaphores.lock().await;
    guard
        .entry(bot_id.to_string())
        .or_insert_with(|| Arc::new(Semaphore::new(state.limits.per_bot)))
        .clone()
}

async fn handle_update(state: &AppState, entry: &QueueEntry) -> anyhow::Result<&'static str> {
    let update: TelegramUpdate = serde_json::from_str(&entry.payload)?;
    let Some(message) = update.message else {
        return Ok("ignored");
    };
    let Some(text) = message.text.as_deref() else {
        return Ok("ignored");
    };

    let command = text.split_whitespace().next().unwrap_or_default();
    let Some(bot) = state
        .repository
        .find_bot_by_webhook_key(&entry.bot_id)
        .await?
    else {
        return Ok("bot_missing");
    };
    if !bot.enabled {
        return Ok("bot_disabled");
    }

    let token = decrypt_token(&state.encryption_key, &bot.token_encrypted)?;
    match command {
        "/create_game" => {
            let mut client = state.game_client.clone();
            let response = client
                .create_room(proto::richcrab::v1::CreateRoomRequest {
                    owner_user_id: Some(proto::richcrab::v1::UserId {
                        value: bot.user_id.to_string(),
                    }),
                    quiz_id: Some(proto::richcrab::v1::QuizId {
                        value: state.default_quiz_id.clone(),
                    }),
                    title: "Telegram room".to_string(),
                    settings: None,
                })
                .await?
                .into_inner();

            let room_id = response
                .room_id
                .map(|v| v.value)
                .context("missing room_id")?;
            store_last_room(
                &state.redis_pool,
                &entry.bot_id,
                &room_id,
                &response.pin,
                &response.invite_token,
                &response.invite_path,
            )
            .await?;

            let text = format!(
                "✅ Игра создана\nPIN: {}\nInvite: {}{}",
                response.pin,
                state.public_base_url.trim_end_matches('/'),
                response.invite_path
            );
            send_telegram_reply(&state.telegram_http, &token, message.chat.id, &text).await?;
            Ok("create_game")
        }
        "/invite" => {
            if let Some(room) = get_last_room(&state.redis_pool, &entry.bot_id).await? {
                let text = format!(
                    "🎟 Invite: {}{}",
                    state.public_base_url.trim_end_matches('/'),
                    room.invite_path
                );
                send_telegram_reply(&state.telegram_http, &token, message.chat.id, &text).await?;
            } else {
                send_telegram_reply(
                    &state.telegram_http,
                    &token,
                    message.chat.id,
                    "Нет данных о комнате. Сначала выполните /create_game",
                )
                .await?;
            }
            Ok("invite")
        }
        "/pin" => {
            if let Some(room) = get_last_room(&state.redis_pool, &entry.bot_id).await? {
                let text = format!("🔐 PIN: {}", room.pin);
                send_telegram_reply(&state.telegram_http, &token, message.chat.id, &text).await?;
            } else {
                send_telegram_reply(
                    &state.telegram_http,
                    &token,
                    message.chat.id,
                    "Нет данных о комнате. Сначала выполните /create_game",
                )
                .await?;
            }
            Ok("pin")
        }
        _ => Ok("ignored"),
    }
}

#[derive(Debug)]
struct LastRoom {
    pin: String,
    invite_path: String,
}

async fn store_last_room(
    redis_pool: &deadpool_redis::Pool,
    bot_id: &str,
    room_id: &str,
    pin: &str,
    invite_token: &str,
    invite_path: &str,
) -> anyhow::Result<()> {
    let mut conn = redis_pool.get().await?;
    let key = format!("bot_runner:last_room:{}", bot_id);
    let mut cmd = redis::cmd("HSET");
    cmd.arg(key)
        .arg("room_id")
        .arg(room_id)
        .arg("pin")
        .arg(pin)
        .arg("invite_token")
        .arg(invite_token)
        .arg("invite_path")
        .arg(invite_path);
    cmd.query_async::<i64>(&mut conn).await?;
    Ok(())
}

async fn get_last_room(
    redis_pool: &deadpool_redis::Pool,
    bot_id: &str,
) -> anyhow::Result<Option<LastRoom>> {
    let mut conn = redis_pool.get().await?;
    let key = format!("bot_runner:last_room:{}", bot_id);
    let mut cmd = redis::cmd("HGETALL");
    cmd.arg(key);
    let raw = cmd
        .query_async::<HashMap<String, String>>(&mut conn)
        .await?;
    if raw.is_empty() {
        return Ok(None);
    }
    Ok(Some(LastRoom {
        pin: raw.get("pin").cloned().unwrap_or_default(),
        invite_path: raw.get("invite_path").cloned().unwrap_or_default(),
    }))
}

async fn send_telegram_reply(
    client: &reqwest::Client,
    token: &str,
    chat_id: i64,
    text: &str,
) -> anyhow::Result<()> {
    let response = client
        .post(format!("https://api.telegram.org/bot{token}/sendMessage"))
        .json(&serde_json::json!({
            "chat_id": chat_id,
            "text": text,
        }))
        .send()
        .await?;
    if !response.status().is_success() {
        return Err(anyhow!(
            "telegram sendMessage failed with {}",
            response.status()
        ));
    }
    Ok(())
}

async fn retry_or_dead_letter(
    state: &AppState,
    entry: &QueueEntry,
    reason: &str,
) -> anyhow::Result<()> {
    if entry.attempt + 1 >= state.queue.max_attempts {
        let mut conn = state.redis_pool.get().await?;
        let mut dlq = redis::cmd("XADD");
        dlq.arg(&state.queue.dead_letter_stream)
            .arg("*")
            .arg("bot_id")
            .arg(&entry.bot_id)
            .arg("update_id")
            .arg(entry.update_id)
            .arg("payload")
            .arg(&entry.payload)
            .arg("error")
            .arg(reason)
            .arg("attempt")
            .arg(entry.attempt + 1);
        dlq.query_async::<String>(&mut conn).await?;

        shared::observability::init_metrics()
            .dead_letter_total
            .with_label_values(&[&entry.stream])
            .inc();

        ack(state, entry).await?;
        return Ok(());
    }

    let backoff_ms = 200_u64 * (entry.attempt + 1) as u64 + (rand::random::<u64>() % 150);
    tokio::time::sleep(Duration::from_millis(backoff_ms)).await;

    let mut conn = state.redis_pool.get().await?;
    let mut requeue = redis::cmd("XADD");
    requeue
        .arg(&entry.stream)
        .arg("*")
        .arg("bot_id")
        .arg(&entry.bot_id)
        .arg("update_id")
        .arg(entry.update_id)
        .arg("payload")
        .arg(&entry.payload)
        .arg("enqueued_at_ms")
        .arg(entry.enqueued_at_ms)
        .arg("attempt")
        .arg(entry.attempt + 1);
    requeue.query_async::<String>(&mut conn).await?;
    ack(state, entry).await?;
    Ok(())
}

async fn ack(state: &AppState, entry: &QueueEntry) -> anyhow::Result<()> {
    let mut conn = state.redis_pool.get().await?;
    let mut cmd = redis::cmd("XACK");
    cmd.arg(&entry.stream)
        .arg(&state.queue.group)
        .arg(&entry.entry_id);
    cmd.query_async::<i64>(&mut conn).await?;
    Ok(())
}

async fn set_once(
    redis_pool: &deadpool_redis::Pool,
    key: &str,
    ttl_seconds: usize,
) -> anyhow::Result<bool> {
    let mut conn = redis_pool.get().await?;
    let mut cmd = redis::cmd("SET");
    cmd.arg(key).arg("1").arg("NX").arg("EX").arg(ttl_seconds);
    let result = cmd.query_async::<Option<String>>(&mut conn).await?;
    Ok(result.is_some())
}

async fn delete_key(redis_pool: &deadpool_redis::Pool, key: &str) -> anyhow::Result<()> {
    let mut conn = redis_pool.get().await?;
    let mut cmd = redis::cmd("DEL");
    cmd.arg(key);
    cmd.query_async::<i64>(&mut conn).await?;
    Ok(())
}

fn decrypt_token(encryption_key: &str, token_encrypted: &str) -> anyhow::Result<String> {
    let payload = base64::engine::general_purpose::STANDARD
        .decode(token_encrypted)
        .context("token decrypt failed")?;
    if payload.len() < 13 {
        return Err(anyhow!("token decrypt payload is invalid"));
    }

    let hash = shared::crypto::sha256_hex(encryption_key);
    let mut key = [0_u8; 32];
    hex::decode_to_slice(hash, &mut key).context("invalid ENCRYPTION_KEY")?;
    let cipher = Aes256Gcm::new((&key).into());
    let (nonce_bytes, ciphertext) = payload.split_at(12);
    let nonce = Nonce::from_slice(nonce_bytes);
    let plaintext = cipher
        .decrypt(nonce, ciphertext)
        .map_err(|_| anyhow!("token decrypt failed"))?;
    String::from_utf8(plaintext).context("token decrypt utf8 failed")
}
