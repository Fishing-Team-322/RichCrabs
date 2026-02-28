mod repository;
mod service;

use std::{env, net::SocketAddr};

use service::BotServiceImpl;
use sqlx::postgres::PgPoolOptions;
use tonic::transport::Server;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    shared::observability::init_tracing("bot");
    shared::observability::init_metrics();

    let database_url = env::var(shared::config::DATABASE_URL)?;
    let migrations_dir = env::var(shared::config::MIGRATIONS_DIR)
        .unwrap_or_else(|_| "/app/richcrab/migrations".to_string());
    let entitlements_addr = env::var(shared::config::SERVICE_ADDR_ENTITLEMENTS)?;
    let addr: SocketAddr = env::var(shared::config::SERVICE_ADDR_BOT)?.parse()?;

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

    let svc = BotServiceImpl::new(pool, entitlements);

    let (mut health_reporter, health_service) = tonic_health::server::health_reporter();
    health_reporter
        .set_serving::<proto::richcrab::v1::bot_service_server::BotServiceServer<BotServiceImpl>>()
        .await;

    Server::builder()
        .add_service(health_service)
        .add_service(proto::richcrab::v1::bot_service_server::BotServiceServer::new(svc))
        .serve(addr)
        .await?;

    Ok(())
}
