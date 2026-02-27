mod repository;

use std::{env, net::SocketAddr};

use axum::{
    extract::{Path, State},
    http::{HeaderMap, StatusCode},
    response::IntoResponse,
    routing::{get, post},
    Json, Router,
};
use repository::BotIngressRepository;
use sqlx::postgres::PgPoolOptions;

#[derive(Clone)]
struct AppState {
    repository: BotIngressRepository,
}

#[derive(serde::Serialize)]
struct SimpleResponse {
    ok: bool,
    message: String,
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    shared::observability::init_tracing("bot_ingress");
    shared::observability::init_metrics();

    let database_url = env::var(shared::config::DATABASE_URL)?;
    let ingress_addr = env::var(shared::config::SERVICE_ADDR_BOT_INGRESS)
        .unwrap_or_else(|_| "0.0.0.0:8090".to_string());

    let pool = PgPoolOptions::new()
        .max_connections(5)
        .connect(&database_url)
        .await?;

    let state = AppState {
        repository: BotIngressRepository::new(pool),
    };

    let app = Router::new()
        .route(
            "/api/v1/telegram/webhook/:bot_id/:webhook_secret",
            post(handle_webhook),
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
    headers: HeaderMap,
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

    (
        StatusCode::GONE,
        Json(SimpleResponse {
            ok: false,
            message: "webhook processing moved to gateway".to_string(),
        }),
    )
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
