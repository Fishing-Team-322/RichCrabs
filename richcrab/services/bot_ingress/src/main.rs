mod repository;

use std::{env, net::SocketAddr};

use axum::{
    body::Bytes,
    extract::Request,
    extract::{Path, State},
    http::{HeaderMap, StatusCode},
    middleware::{self, Next},
    response::IntoResponse,
    routing::{get, post},
    Json, Router,
};
use deadpool_redis::redis;
use repository::BotIngressRepository;
use serde::Deserialize;
use sqlx::postgres::PgPoolOptions;
use subtle::ConstantTimeEq;

#[derive(Clone)]
struct AppState {
    repository: BotIngressRepository,
    redis_pool: deadpool_redis::Pool,
    stream_partitions: u64,
    stream_prefix: String,
}

#[derive(serde::Serialize)]
struct SimpleResponse {
    ok: bool,
    message: String,
}

#[derive(Debug, Deserialize)]
struct TelegramUpdateEnvelope {
    update_id: i64,
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    shared::observability::init_tracing("bot_ingress");
    shared::observability::init_metrics();

    let database_url = env::var(shared::config::DATABASE_URL)?;
    let migrations_dir = env::var(shared::config::MIGRATIONS_DIR)
        .unwrap_or_else(|_| "/app/richcrab/migrations".to_string());
    let ingress_addr = env::var(shared::config::SERVICE_ADDR_BOT_INGRESS)
        .unwrap_or_else(|_| "0.0.0.0:8090".to_string());

    let redis_url = env::var(shared::config::REDIS_URL)?;
    let redis_cfg = deadpool_redis::Config::from_url(redis_url);
    let redis_pool = redis_cfg.create_pool(Some(deadpool_redis::Runtime::Tokio1))?;

    let pool = PgPoolOptions::new()
        .max_connections(5)
        .connect(&database_url)
        .await?;
    shared::db::run_migrations(&pool, &migrations_dir).await?;

    let state = AppState {
        repository: BotIngressRepository::new(pool),
        redis_pool,
        stream_partitions: env::var("BOT_QUEUE_PARTITIONS")
            .ok()
            .and_then(|v| v.parse::<u64>().ok())
            .unwrap_or(16)
            .max(1),
        stream_prefix: env::var("BOT_QUEUE_STREAM_PREFIX")
            .unwrap_or_else(|_| "bot_updates".to_string()),
    };

    let app = Router::new()
        .nest(
            "/api/v1/telegram/webhook",
            Router::new()
                .route("/:bot_id/:webhook_secret", post(handle_webhook))
                .layer(middleware::from_fn(telegram_secret_guard)),
        )
        .route("/health", get(health))
        .route("/metrics", get(shared::observability::metrics_handler))
        .with_state(state);

    let addr: SocketAddr = ingress_addr.parse()?;
    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app).await?;
    Ok(())
}

async fn handle_webhook(
    Path((bot_id, webhook_secret)): Path<(String, String)>,
    State(state): State<AppState>,
    body: Bytes,
) -> impl IntoResponse {
    let metrics = shared::observability::init_metrics();
    metrics
        .tg_updates_total
        .with_label_values(&["received"])
        .inc();

    let Some(bot) = state.repository.find_secret(&bot_id).await.ok().flatten() else {
        return (
            StatusCode::NOT_FOUND,
            Json(SimpleResponse {
                ok: false,
                message: "bot not found".to_string(),
            }),
        )
            .into_response();
    };

    if bot.webhook_secret != webhook_secret {
        return (
            StatusCode::FORBIDDEN,
            Json(SimpleResponse {
                ok: false,
                message: "invalid webhook secret".to_string(),
            }),
        )
            .into_response();
    }

    let parsed = serde_json::from_slice::<TelegramUpdateEnvelope>(&body);
    let Ok(update) = parsed else {
        return (
            StatusCode::BAD_REQUEST,
            Json(SimpleResponse {
                ok: false,
                message: "invalid telegram update payload".to_string(),
            }),
        )
            .into_response();
    };

    if let Err(err) = enqueue_update(&state, &bot_id, update.update_id, &body).await {
        tracing::error!(error = %err, bot_id, "failed to enqueue telegram update");
        shared::observability::error("bot_ingress", "enqueue_failed");
        return (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(SimpleResponse {
                ok: false,
                message: "queue is unavailable".to_string(),
            }),
        )
            .into_response();
    }

    metrics
        .tg_updates_total
        .with_label_values(&["queued"])
        .inc();
    (
        StatusCode::OK,
        Json(SimpleResponse {
            ok: true,
            message: "accepted".to_string(),
        }),
    )
        .into_response()
}

async fn enqueue_update(
    state: &AppState,
    bot_id: &str,
    update_id: i64,
    payload: &[u8],
) -> anyhow::Result<()> {
    let mut conn = state.redis_pool.get().await?;
    let partition = (stable_hash(bot_id) % state.stream_partitions) as usize;
    let stream = format!("{}:{}", state.stream_prefix, partition);
    let now_ms = chrono::Utc::now().timestamp_millis();

    let mut command = redis::cmd("XADD");
    command
        .arg(&stream)
        .arg("MAXLEN")
        .arg("~")
        .arg(100_000)
        .arg("*")
        .arg("bot_id")
        .arg(bot_id)
        .arg("update_id")
        .arg(update_id)
        .arg("payload")
        .arg(payload)
        .arg("enqueued_at_ms")
        .arg(now_ms)
        .arg("attempt")
        .arg(0);

    command.query_async::<String>(&mut conn).await?;
    Ok(())
}

fn stable_hash(value: &str) -> u64 {
    use std::hash::{Hash, Hasher};
    let mut hasher = std::collections::hash_map::DefaultHasher::new();
    value.hash(&mut hasher);
    hasher.finish()
}

async fn telegram_secret_guard(request: Request, next: Next) -> impl IntoResponse {
    let headers: &HeaderMap = request.headers();
    let Some(header_secret) = headers
        .get("x-telegram-bot-api-secret-token")
        .and_then(|value| value.to_str().ok())
    else {
        return (
            StatusCode::UNAUTHORIZED,
            Json(SimpleResponse {
                ok: false,
                message: "missing telegram secret header".to_string(),
            }),
        )
            .into_response();
    };

    let path = request.uri().path();
    let Some(webhook_secret) = path.rsplit('/').next() else {
        return (
            StatusCode::UNAUTHORIZED,
            Json(SimpleResponse {
                ok: false,
                message: "invalid webhook path".to_string(),
            }),
        )
            .into_response();
    };

    if !secure_equal(header_secret.as_bytes(), webhook_secret.as_bytes()) {
        return (
            StatusCode::UNAUTHORIZED,
            Json(SimpleResponse {
                ok: false,
                message: "telegram secret header mismatch".to_string(),
            }),
        )
            .into_response();
    }

    next.run(request).await
}

fn secure_equal(left: &[u8], right: &[u8]) -> bool {
    left.len() == right.len() && left.ct_eq(right).into()
}

async fn health() -> impl IntoResponse {
    (
        StatusCode::OK,
        Json(SimpleResponse {
            ok: true,
            message: "ok".to_string(),
        }),
    )
}
