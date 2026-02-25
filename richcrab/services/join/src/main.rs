mod repository;
mod service;

use std::{env, net::SocketAddr, time::Duration};

use service::JoinServiceImpl;
use shared::redis_client::RedisClient;
use tonic::transport::Server;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    shared::observability::init_tracing("join");
    shared::observability::init_metrics();

    let redis_url = env::var(shared::config::REDIS_URL)?;
    let addr: SocketAddr = env::var(shared::config::SERVICE_ADDR_JOIN)?.parse()?;

    let redis = RedisClient::new(
        redis_url,
        16,
        Duration::from_secs(2),
        2,
        Duration::from_millis(50),
    )?;

    let svc = JoinServiceImpl::new(redis);

    let (mut health_reporter, health_service) = tonic_health::server::health_reporter();
    health_reporter
        .set_serving::<proto::richcrab::v1::join_service_server::JoinServiceServer<JoinServiceImpl>>()
        .await;

    Server::builder()
        .add_service(health_service)
        .add_service(proto::richcrab::v1::join_service_server::JoinServiceServer::new(svc))
        .serve(addr)
        .await?;

    Ok(())
}
