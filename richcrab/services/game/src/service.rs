use std::{
    collections::HashMap,
    sync::Arc,
    time::{Duration, Instant},
};

use shared::redis_client::RedisClient;
use tokio::sync::RwLock;
use tonic::Status;

use crate::{
    infrastructure::{
        chat_repository_adapter::DynChatRepository,
        entitlements_client::GrpcEntitlementsClient,
        quiz_client::{DynQuizClient, QuizClient},
    },
    repository::RoomChatRepository,
    room_actor::{RoomHandle, RoomRegistry},
};

pub struct GameServiceImpl {
    pub(crate) redis: RedisClient,
    pub(crate) rooms: RoomRegistry,
    pub(crate) room_pins: Arc<RwLock<HashMap<String, String>>>,
    pub(crate) chat_repository: DynChatRepository,
    pub(crate) chat_rate_limit: Arc<RwLock<HashMap<String, Instant>>>,
    pub(crate) entitlements: GrpcEntitlementsClient,
    pub(crate) quiz: DynQuizClient,
    pub(crate) pin_ttl: Duration,
    pub(crate) chat_min_interval: Duration,
}

impl GameServiceImpl {
    pub fn new(
        redis: RedisClient,
        entitlements: GrpcEntitlementsClient,
        quiz: impl QuizClient + 'static,
        chat_repository: RoomChatRepository,
    ) -> Self {
        Self {
            redis,
            rooms: Arc::new(RwLock::new(HashMap::new())),
            room_pins: Arc::new(RwLock::new(HashMap::new())),
            entitlements,
            quiz: Arc::new(quiz),
            chat_repository: Arc::new(chat_repository),
            chat_rate_limit: Arc::new(RwLock::new(HashMap::new())),
            pin_ttl: Duration::from_secs(60 * 60 * 12),
            chat_min_interval: Duration::from_millis(750),
        }
    }

    pub(crate) async fn resolve_room(&self, room_id: &str) -> Result<RoomHandle, Status> {
        self.rooms
            .read()
            .await
            .get(room_id)
            .cloned()
            .ok_or_else(|| Status::not_found("room not found"))
    }

    pub(crate) fn now_ts() -> Option<prost_types::Timestamp> {
        Some(prost_types::Timestamp::from(std::time::SystemTime::now()))
    }
}

#[derive(Default)]
pub struct HealthServiceImpl;

#[tonic::async_trait]
impl proto::richcrab::v1::health_server::Health for HealthServiceImpl {
    async fn ping(
        &self,
        _request: tonic::Request<proto::richcrab::v1::PingRequest>,
    ) -> Result<tonic::Response<proto::richcrab::v1::PingResponse>, tonic::Status> {
        Ok(tonic::Response::new(proto::richcrab::v1::PingResponse {
            message: "pong".to_string(),
        }))
    }
}
