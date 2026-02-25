use std::time::{Duration, SystemTime};

use serde::{Deserialize, Serialize};
use shared::{redis_client::RedisClient, redis_keys};
use tonic::{Request, Response, Status};
use tracing::info;
use uuid::Uuid;

#[derive(Clone)]
pub struct JoinServiceImpl {
    redis: RedisClient,
    ticket_ttl: Duration,
    rate_limit_ttl: Duration,
    max_requests_per_window: u64,
}

#[derive(Debug, Serialize, Deserialize)]
struct JoinTicketPayload {
    room_id: String,
    display_name: String,
    issued_at_unix: i64,
}

impl JoinServiceImpl {
    pub fn new(redis: RedisClient) -> Self {
        Self {
            redis,
            ticket_ttl: redis_keys::TICKET_TTL,
            rate_limit_ttl: Duration::from_secs(60),
            max_requests_per_window: 8,
        }
    }

    fn now_ts() -> Option<prost_types::Timestamp> {
        Some(prost_types::Timestamp::from(SystemTime::now()))
    }

    fn expires_ts(&self) -> Option<prost_types::Timestamp> {
        Some(prost_types::Timestamp::from(
            SystemTime::now() + self.ticket_ttl,
        ))
    }

    fn ingress_keys(metadata: &tonic::metadata::MetadataMap) -> Vec<String> {
        let mut keys = Vec::new();

        if let Some(ip) = metadata
            .get("x-forwarded-for")
            .and_then(|v| v.to_str().ok())
            .and_then(|raw| raw.split(',').next())
            .map(str::trim)
            .filter(|v| !v.is_empty())
        {
            keys.push(format!("ip:{ip}"));
        } else if let Some(ip) = metadata
            .get("x-real-ip")
            .and_then(|v| v.to_str().ok())
            .map(str::trim)
            .filter(|v| !v.is_empty())
        {
            keys.push(format!("ip:{ip}"));
        }

        if let Some(device) = metadata
            .get("x-device-key")
            .and_then(|v| v.to_str().ok())
            .map(str::trim)
            .filter(|v| !v.is_empty())
        {
            keys.push(format!("device:{device}"));
        }

        keys
    }

    async fn check_limit(&self, key: String) -> Result<(), Status> {
        let value = self
            .redis
            .increment_with_ttl(&key, self.rate_limit_ttl)
            .await
            .map_err(|e| Status::internal(format!("rate limit check failed: {e}")))?;
        if value > self.max_requests_per_window {
            return Err(Status::resource_exhausted("too many join ticket requests"));
        }
        Ok(())
    }

    async fn enforce_rate_limits(
        &self,
        source_key: &str,
        display_name: &str,
        metadata: &tonic::metadata::MetadataMap,
    ) -> Result<(), Status> {
        self.check_limit(redis_keys::ratelimit_key("join-source", source_key))
            .await?;
        self.check_limit(redis_keys::ratelimit_key("join-display-name", display_name))
            .await?;

        for ingress in Self::ingress_keys(metadata) {
            self.check_limit(redis_keys::ratelimit_key("join-ingress", ingress))
                .await?;
        }

        Ok(())
    }

    async fn resolve_room_id(&self, redis_key: String) -> Result<String, Status> {
        self.redis
            .get_value(&redis_key)
            .await
            .map_err(|e| Status::internal(format!("lookup failed: {e}")))?
            .ok_or_else(|| Status::not_found("room is not joinable with provided code"))
    }

    async fn issue_ticket(&self, room_id: String, display_name: String) -> Result<String, Status> {
        let token = Uuid::new_v4().to_string();
        let payload = JoinTicketPayload {
            room_id,
            display_name,
            issued_at_unix: chrono::Utc::now().timestamp(),
        };
        let json = serde_json::to_string(&payload)
            .map_err(|e| Status::internal(format!("ticket serialization failed: {e}")))?;

        self.redis
            .set_with_ttl(&redis_keys::ticket_key(&token), &json, self.ticket_ttl)
            .await
            .map_err(|e| Status::internal(format!("ticket storage failed: {e}")))?;

        Ok(token)
    }
}

#[tonic::async_trait]
impl proto::richcrab::v1::join_service_server::JoinService for JoinServiceImpl {
    async fn issue_join_ticket_by_pin(
        &self,
        request: Request<proto::richcrab::v1::IssueJoinTicketByPinRequest>,
    ) -> Result<Response<proto::richcrab::v1::IssueJoinTicketResponse>, Status> {
        let metrics = shared::observability::init_metrics();
        let metadata = request.metadata().clone();
        let req = request.into_inner();
        info!(request_id = %uuid::Uuid::new_v4(), room_id = "", user_id = "", bot_id = "", "issue_join_ticket_by_pin");
        if req.pin.is_empty() {
            return Err(Status::invalid_argument("pin is required"));
        }
        if req.display_name.trim().is_empty() {
            return Err(Status::invalid_argument("display_name is required"));
        }

        self.enforce_rate_limits(&format!("pin:{}", req.pin), &req.display_name, &metadata)
            .await?;
        let room_id = self.resolve_room_id(redis_keys::pin_key(&req.pin)).await?;
        let token = self
            .issue_ticket(room_id.clone(), req.display_name.clone())
            .await?;
        metrics
            .join_ticket_issued_total
            .with_label_values(&["pin"])
            .inc();

        Ok(Response::new(
            proto::richcrab::v1::IssueJoinTicketResponse {
                ticket: Some(proto::richcrab::v1::JoinTicket {
                    token,
                    room_id: Some(proto::richcrab::v1::RoomId { value: room_id }),
                    display_name: req.display_name,
                    issued_at: Self::now_ts(),
                    expires_at: self.expires_ts(),
                }),
                error: None,
            },
        ))
    }

    async fn issue_join_ticket_by_invite(
        &self,
        request: Request<proto::richcrab::v1::IssueJoinTicketByInviteRequest>,
    ) -> Result<Response<proto::richcrab::v1::IssueJoinTicketResponse>, Status> {
        let metrics = shared::observability::init_metrics();
        let metadata = request.metadata().clone();
        let req = request.into_inner();
        info!(request_id = %uuid::Uuid::new_v4(), room_id = "", user_id = "", bot_id = "", "issue_join_ticket_by_invite");
        if req.invite_token.is_empty() {
            return Err(Status::invalid_argument("invite_token is required"));
        }
        if req.display_name.trim().is_empty() {
            return Err(Status::invalid_argument("display_name is required"));
        }

        self.enforce_rate_limits(
            &format!("invite:{}", req.invite_token),
            &req.display_name,
            &metadata,
        )
        .await?;
        let room_id = self
            .resolve_room_id(redis_keys::invite_key(&req.invite_token))
            .await?;
        let token = self
            .issue_ticket(room_id.clone(), req.display_name.clone())
            .await?;
        metrics
            .join_ticket_issued_total
            .with_label_values(&["invite"])
            .inc();

        Ok(Response::new(
            proto::richcrab::v1::IssueJoinTicketResponse {
                ticket: Some(proto::richcrab::v1::JoinTicket {
                    token,
                    room_id: Some(proto::richcrab::v1::RoomId { value: room_id }),
                    display_name: req.display_name,
                    issued_at: Self::now_ts(),
                    expires_at: self.expires_ts(),
                }),
                error: None,
            },
        ))
    }
}
