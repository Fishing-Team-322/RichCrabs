mod application {
    pub mod bot_management;
    pub mod error;
}
mod infrastructure {
    pub mod entitlements_guard;
}
mod providers {
    pub mod error;
    pub mod telegram_client;
}
mod repository;
mod security {
    pub mod token_crypto;
}
mod transport {
    pub mod authz;
    pub mod grpc_service;
}

use std::{env, net::SocketAddr};

use application::bot_management::BotManagement;
use infrastructure::entitlements_guard::EntitlementsGuard;
use providers::telegram_client::TelegramClient;
use repository::BotRepository;
use sqlx::postgres::PgPoolOptions;
use tonic::transport::Server;
use transport::grpc_service::BotGrpcService;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    shared::observability::init_tracing("bot");
    shared::observability::init_metrics();

    let database_url = env::var(shared::config::DATABASE_URL)?;
    let migrations_dir = env::var(shared::config::MIGRATIONS_DIR)
        .unwrap_or_else(|_| "/app/richcrab/migrations".to_string());
    let entitlements_addr = env::var(shared::config::SERVICE_ADDR_ENTITLEMENTS)?;
    let addr: SocketAddr = env::var(shared::config::SERVICE_ADDR_BOT)?.parse()?;
    let encryption_key = env::var(shared::config::ENCRYPTION_KEY).unwrap_or_default();
    let webhook_base_url = env::var(shared::config::TELEGRAM_WEBHOOK_BASE_URL).unwrap_or_default();

    let pool = PgPoolOptions::new()
        .max_connections(5)
        .connect(&database_url)
        .await?;
    let entitlements =
        proto::richcrab::v1::entitlements_service_client::EntitlementsServiceClient::connect(
            format!("http://{entitlements_addr}"),
        )
        .await?;
    shared::db::run_migrations(&pool, &migrations_dir).await?;

    let app = BotManagement::new(
        BotRepository::new(pool),
        EntitlementsGuard::new(entitlements),
        TelegramClient::new(webhook_base_url),
        encryption_key,
    );
    let svc = BotGrpcService::new(app);

    let (mut health_reporter, health_service) = tonic_health::server::health_reporter();
    health_reporter
        .set_serving::<proto::richcrab::v1::bot_service_server::BotServiceServer<BotGrpcService>>()
        .await;

    Server::builder()
        .add_service(health_service)
        .add_service(proto::richcrab::v1::bot_service_server::BotServiceServer::new(svc))
        .serve(addr)
        .await?;

    Ok(())
}
