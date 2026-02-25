mod repository;
mod service;

use std::{env, net::SocketAddr};

use service::QuizServiceImpl;
use sqlx::postgres::PgPoolOptions;
use tonic::transport::Server;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    shared::observability::init_tracing("quiz");
    shared::observability::init_metrics();

    let database_url = env::var(shared::config::DATABASE_URL)?;
    let entitlements_addr = env::var(shared::config::SERVICE_ADDR_ENTITLEMENTS)?;
    let addr: SocketAddr = env::var(shared::config::SERVICE_ADDR_QUIZ)?.parse()?;

    let pool = PgPoolOptions::new()
        .max_connections(5)
        .connect(&database_url)
        .await?;
    let entitlements =
        proto::richcrab::v1::entitlements_service_client::EntitlementsServiceClient::connect(
            format!("http://{entitlements_addr}"),
        )
        .await?;
    let svc = QuizServiceImpl::new(pool, entitlements);

    let (mut health_reporter, health_service) = tonic_health::server::health_reporter();
    health_reporter
        .set_serving::<proto::richcrab::v1::quiz_service_server::QuizServiceServer<QuizServiceImpl>>()
        .await;

    Server::builder()
        .add_service(health_service)
        .add_service(proto::richcrab::v1::quiz_service_server::QuizServiceServer::new(svc))
        .serve(addr)
        .await?;

    Ok(())
}
