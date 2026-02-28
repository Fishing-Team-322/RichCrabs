mod application;
mod domain;
mod infrastructure;
mod repository;
mod room_actor;
mod service;
mod transport;

use std::{env, net::SocketAddr, time::Duration};

use infrastructure::{entitlements_client::GrpcEntitlementsClient, quiz_client::GrpcQuizClient};
use repository::RoomChatRepository;
use service::{GameServiceImpl, HealthServiceImpl};
use shared::redis_client::RedisClient;
use sqlx::postgres::PgPoolOptions;
use tokio::time::sleep;
use tonic::transport::Server;

const UPSTREAM_CONNECT_ATTEMPTS: usize = 30;
const UPSTREAM_CONNECT_DELAY: Duration = Duration::from_millis(500);

async fn connect_entitlements_with_retry(
    entitlements_addr: &str,
) -> anyhow::Result<
    proto::richcrab::v1::entitlements_service_client::EntitlementsServiceClient<
        tonic::transport::Channel,
    >,
> {
    let endpoint = format!("http://{entitlements_addr}");
    let mut last_error = None;

    for attempt in 1..=UPSTREAM_CONNECT_ATTEMPTS {
        match proto::richcrab::v1::entitlements_service_client::EntitlementsServiceClient::connect(
            endpoint.clone(),
        )
        .await
        {
            Ok(client) => return Ok(client),
            Err(error) => {
                last_error = Some(error);
                tracing::warn!(
                    attempt,
                    max_attempts = UPSTREAM_CONNECT_ATTEMPTS,
                    address = %entitlements_addr,
                    "failed to connect to entitlements, retrying"
                );
                sleep(UPSTREAM_CONNECT_DELAY).await;
            }
        }
    }

    Err(anyhow::anyhow!(
        "failed to connect to entitlements at {} after {} attempts: {}",
        entitlements_addr,
        UPSTREAM_CONNECT_ATTEMPTS,
        last_error
            .map(|e| e.to_string())
            .unwrap_or_else(|| "unknown error".to_string())
    ))
}

async fn connect_quiz_with_retry(
    quiz_addr: &str,
) -> anyhow::Result<
    proto::richcrab::v1::quiz_service_client::QuizServiceClient<tonic::transport::Channel>,
> {
    let endpoint = format!("http://{quiz_addr}");
    let mut last_error = None;

    for attempt in 1..=UPSTREAM_CONNECT_ATTEMPTS {
        match proto::richcrab::v1::quiz_service_client::QuizServiceClient::connect(endpoint.clone())
            .await
        {
            Ok(client) => return Ok(client),
            Err(error) => {
                last_error = Some(error);
                tracing::warn!(
                    attempt,
                    max_attempts = UPSTREAM_CONNECT_ATTEMPTS,
                    address = %quiz_addr,
                    "failed to connect to quiz, retrying"
                );
                sleep(UPSTREAM_CONNECT_DELAY).await;
            }
        }
    }

    Err(anyhow::anyhow!(
        "failed to connect to quiz at {} after {} attempts: {}",
        quiz_addr,
        UPSTREAM_CONNECT_ATTEMPTS,
        last_error
            .map(|e| e.to_string())
            .unwrap_or_else(|| "unknown error".to_string())
    ))
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    shared::observability::init_tracing("game");
    shared::observability::init_metrics();

    let redis_url = env::var(shared::config::REDIS_URL)?;
    let database_url = env::var(shared::config::DATABASE_URL)?;
    let entitlements_addr = env::var(shared::config::SERVICE_ADDR_ENTITLEMENTS)?;
    let quiz_addr = env::var(shared::config::SERVICE_ADDR_QUIZ)?;
    let addr: SocketAddr = env::var(shared::config::SERVICE_ADDR_GAME)?.parse()?;

    let redis = RedisClient::new(
        redis_url,
        16,
        Duration::from_secs(2),
        2,
        Duration::from_millis(50),
    )?;
    let pool = PgPoolOptions::new()
        .max_connections(10)
        .connect(&database_url)
        .await?;
    let chat_repository = RoomChatRepository::new(pool);

    let entitlements = connect_entitlements_with_retry(&entitlements_addr).await?;
    let quiz = connect_quiz_with_retry(&quiz_addr).await?;
    let game_service = GameServiceImpl::new(
        redis,
        GrpcEntitlementsClient::new(entitlements),
        GrpcQuizClient::new(quiz),
        chat_repository,
    );
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
