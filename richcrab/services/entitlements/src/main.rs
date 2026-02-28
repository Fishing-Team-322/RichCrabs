mod repository;
mod service;

use std::{env, net::SocketAddr, time::Duration};

use service::EntitlementsServiceImpl;
use shared::redis_client::RedisClient;
use sqlx::postgres::PgPoolOptions;
use tonic::transport::Server;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    shared::observability::init_tracing("entitlements");
    shared::observability::init_metrics();

    let database_url = env::var(shared::config::DATABASE_URL)?;
    let migrations_dir = env::var(shared::config::MIGRATIONS_DIR)
        .unwrap_or_else(|_| "/app/richcrab/migrations".to_string());
    let redis_url = env::var(shared::config::REDIS_URL)?;
    let addr: SocketAddr = env::var(shared::config::SERVICE_ADDR_ENTITLEMENTS)?.parse()?;

    let pool = PgPoolOptions::new()
        .max_connections(5)
        .connect(&database_url)
        .await?;
    let redis = RedisClient::new(
        redis_url,
        16,
        Duration::from_secs(2),
        2,
        Duration::from_millis(50),
    )?;
    shared::db::run_migrations(&pool, &migrations_dir).await?;

    let svc = EntitlementsServiceImpl::new(pool, redis);

    let (mut health_reporter, health_service) = tonic_health::server::health_reporter();
    health_reporter
        .set_serving::<proto::richcrab::v1::entitlements_service_server::EntitlementsServiceServer<
            EntitlementsServiceImpl,
        >>()
        .await;

    Server::builder()
        .add_service(health_service)
        .add_service(
            proto::richcrab::v1::entitlements_service_server::EntitlementsServiceServer::new(svc),
        )
        .serve(addr)
        .await?;

    Ok(())
}
