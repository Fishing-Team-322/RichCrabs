mod repository;
mod service;

use std::{env, net::SocketAddr};

use service::AuthServiceImpl;
use sqlx::postgres::PgPoolOptions;
use tonic::transport::Server;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    shared::observability::init_tracing("auth");
    shared::observability::init_metrics();

    let database_url = env::var(shared::config::DATABASE_URL)?;
    let addr: SocketAddr = env::var(shared::config::SERVICE_ADDR_AUTH)?.parse()?;

    let pool = PgPoolOptions::new()
        .max_connections(5)
        .connect(&database_url)
        .await?;
    let svc = AuthServiceImpl::new(pool);

    let (mut health_reporter, health_service) = tonic_health::server::health_reporter();
    health_reporter
        .set_serving::<proto::richcrab::v1::auth_service_server::AuthServiceServer<AuthServiceImpl>>()
        .await;

    Server::builder()
        .add_service(health_service)
        .add_service(proto::richcrab::v1::auth_service_server::AuthServiceServer::new(svc))
        .serve(addr)
        .await?;

    Ok(())
}
