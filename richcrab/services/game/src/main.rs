mod domain;
mod room_actor;
mod service;

use std::{env, net::SocketAddr, time::Duration};

use service::{GameServiceImpl, HealthServiceImpl};
use shared::redis_client::RedisClient;
use tonic::transport::Server;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    shared::observability::init_tracing("game");
    shared::observability::init_metrics();

    let redis_url = env::var(shared::config::REDIS_URL)?;
    let entitlements_addr = env::var(shared::config::SERVICE_ADDR_ENTITLEMENTS)?;
    let addr: SocketAddr = env::var(shared::config::SERVICE_ADDR_GAME)?.parse()?;

    let redis = RedisClient::new(
        redis_url,
        16,
        Duration::from_secs(2),
        2,
        Duration::from_millis(50),
    )?;
    let entitlements =
        proto::richcrab::v1::entitlements_service_client::EntitlementsServiceClient::connect(
            format!("http://{entitlements_addr}"),
        )
        .await?;
    let game_service = GameServiceImpl::new(redis, entitlements);
    let health_ping_service = HealthServiceImpl;

    let (mut health_reporter, health_service) = tonic_health::server::health_reporter();
    health_reporter
        .set_serving::<proto::richcrab::v1::game_service_server::GameServiceServer<GameServiceImpl>>()
        .await;
    health_reporter
        .set_serving::<proto::richcrab::v1::health_server::HealthServer<HealthServiceImpl>>()
        .await;

    Server::builder()
        .add_service(health_service)
        .add_service(proto::richcrab::v1::game_service_server::GameServiceServer::new(game_service))
        .add_service(proto::richcrab::v1::health_server::HealthServer::new(
            health_ping_service,
        ))
        .serve(addr)
        .await?;

    Ok(())
}
