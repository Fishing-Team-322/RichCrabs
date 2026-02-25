mod repository;

use std::{collections::HashMap, env, net::SocketAddr, sync::Arc};

use axum::{
    extract::{Path, State},
    http::{HeaderMap, StatusCode},
    response::IntoResponse,
    routing::post,
    Json, Router,
};
use repository::BotIngressRepository;
use serde::Deserialize;
use sqlx::postgres::PgPoolOptions;
use tokio::sync::RwLock;

#[derive(Clone)]
struct AppState {
    repository: BotIngressRepository,
    game_client:
        proto::richcrab::v1::game_service_client::GameServiceClient<tonic::transport::Channel>,
    room_state: Arc<RwLock<HashMap<i64, RoomContext>>>,
}

#[derive(Debug, Clone)]
struct RoomContext {
    room_id: String,
    pin: String,
    invite_token: String,
}

#[derive(Debug, Deserialize)]
struct TelegramUpdate {
    message: Option<TelegramMessage>,
}

#[derive(Debug, Deserialize)]
struct TelegramMessage {
    text: Option<String>,
    chat: TelegramChat,
}

#[derive(Debug, Deserialize)]
struct TelegramChat {
    id: i64,
}

#[derive(serde::Serialize)]
struct SimpleResponse {
    ok: bool,
    message: String,
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let database_url = env::var(shared::config::DATABASE_URL)?;
    let game_addr = env::var(shared::config::SERVICE_ADDR_GAME)?;
    let ingress_addr = env::var(shared::config::SERVICE_ADDR_BOT_INGRESS)
        .unwrap_or_else(|_| "0.0.0.0:8090".to_string());

    let pool = PgPoolOptions::new()
        .max_connections(5)
        .connect(&database_url)
        .await?;
    let game_client =
        proto::richcrab::v1::game_service_client::GameServiceClient::connect(game_addr).await?;

    let state = AppState {
        repository: BotIngressRepository::new(pool),
        game_client,
        room_state: Arc::new(RwLock::new(HashMap::new())),
    };

    let app = Router::new()
        .route("/tg/:telegram_bot_id/:webhook_secret", post(handle_webhook))
        .with_state(state);

    let addr: SocketAddr = ingress_addr.parse()?;
    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app).await?;
    Ok(())
}

async fn handle_webhook(
    Path((telegram_bot_id, webhook_secret)): Path<(i64, String)>,
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(update): Json<TelegramUpdate>,
) -> impl IntoResponse {
    let Some(bot) = state
        .repository
        .find_secret(telegram_bot_id)
        .await
        .ok()
        .flatten()
    else {
        return (
            StatusCode::NOT_FOUND,
            Json(SimpleResponse {
                ok: false,
                message: "bot not found".to_string(),
            }),
        );
    };

    if bot.webhook_secret != webhook_secret {
        return (
            StatusCode::FORBIDDEN,
            Json(SimpleResponse {
                ok: false,
                message: "invalid webhook secret".to_string(),
            }),
        );
    }

    if let Some(secret_header) = headers
        .get("x-telegram-bot-api-secret-token")
        .and_then(|value| value.to_str().ok())
    {
        if secret_header != webhook_secret {
            return (
                StatusCode::FORBIDDEN,
                Json(SimpleResponse {
                    ok: false,
                    message: "telegram secret header mismatch".to_string(),
                }),
            );
        }
    }

    let message_text = update
        .message
        .as_ref()
        .and_then(|msg| msg.text.as_ref())
        .map(|text| text.trim().to_string());

    let Some(text) = message_text else {
        return (
            StatusCode::OK,
            Json(SimpleResponse {
                ok: true,
                message: "ignored non-text update".to_string(),
            }),
        );
    };

    let mut game_client = state.game_client.clone();
    let response_message = if text.starts_with("/newgame") {
        match game_client
            .create_room(proto::richcrab::v1::CreateRoomRequest {
                owner_user_id: Some(proto::richcrab::v1::UserId {
                    value: bot.user_id.to_string(),
                }),
                quiz_id: Some(proto::richcrab::v1::QuizId {
                    value: "default".to_string(),
                }),
                title: format!("Telegram room {}", bot.username),
            })
            .await
        {
            Ok(resp) => {
                let payload = resp.into_inner();
                let room_id = payload.room_id.map(|id| id.value).unwrap_or_default();
                let context = RoomContext {
                    room_id,
                    pin: payload.pin,
                    invite_token: payload.invite_token,
                };
                let chat_id = update.message.map(|msg| msg.chat.id).unwrap_or_default();
                state
                    .room_state
                    .write()
                    .await
                    .insert(chat_id, context.clone());
                format!(
                    "new game created: pin={} invite={}",
                    context.pin, context.invite_token
                )
            }
            Err(err) => format!("failed to create room: {err}"),
        }
    } else if text.starts_with("/invite") {
        let chat_id = update.message.map(|msg| msg.chat.id).unwrap_or_default();
        if let Some(ctx) = state.room_state.read().await.get(&chat_id) {
            format!("invite={} pin={}", ctx.invite_token, ctx.pin)
        } else {
            "no active room, run /newgame first".to_string()
        }
    } else if text.starts_with("/start") {
        let chat_id = update.message.map(|msg| msg.chat.id).unwrap_or_default();
        let room = state.room_state.read().await.get(&chat_id).cloned();
        if let Some(room) = room {
            match game_client
                .start_game(proto::richcrab::v1::StartGameRequest {
                    room_id: Some(proto::richcrab::v1::RoomId {
                        value: room.room_id,
                    }),
                    requested_by: Some(proto::richcrab::v1::UserId {
                        value: bot.user_id.to_string(),
                    }),
                })
                .await
            {
                Ok(_) => "game started".to_string(),
                Err(err) => format!("failed to start game: {err}"),
            }
        } else {
            "no active room, run /newgame first".to_string()
        }
    } else {
        "unknown command".to_string()
    };

    (
        StatusCode::OK,
        Json(SimpleResponse {
            ok: true,
            message: response_message,
        }),
    )
}
