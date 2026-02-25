use chrono::Utc;
use sqlx::PgPool;
use tonic::{Request, Response, Status};
use uuid::Uuid;

use crate::repository::{Bot, BotRepository};

pub struct BotServiceImpl {
    repository: BotRepository,
    entitlements: proto::richcrab::v1::entitlements_service_client::EntitlementsServiceClient<
        tonic::transport::Channel,
    >,
}

impl BotServiceImpl {
    pub fn new(
        pool: PgPool,
        entitlements: proto::richcrab::v1::entitlements_service_client::EntitlementsServiceClient<
            tonic::transport::Channel,
        >,
    ) -> Self {
        Self {
            repository: BotRepository::new(pool),
            entitlements,
        }
    }

    async fn check_and_report(&self, user_id: &str, feature: &str) -> Result<(), Status> {
        let mut client = self.entitlements.clone();
        let check = client
            .check_entitlement(proto::richcrab::v1::CheckEntitlementRequest {
                user_id: Some(proto::richcrab::v1::UserId {
                    value: user_id.to_string(),
                }),
                feature: feature.to_string(),
            })
            .await
            .map_err(|e| Status::unavailable(format!("entitlements unavailable: {e}")))?
            .into_inner();

        if !check.allowed {
            return Err(Status::permission_denied(check.reason));
        }

        client
            .report_usage(proto::richcrab::v1::ReportUsageRequest {
                user_id: Some(proto::richcrab::v1::UserId {
                    value: user_id.to_string(),
                }),
                feature: feature.to_string(),
                units: 1,
            })
            .await
            .map_err(|e| Status::unavailable(format!("usage reporting failed: {e}")))?;

        Ok(())
    }

    fn actor_user_id(metadata: &tonic::metadata::MetadataMap) -> Result<String, Status> {
        metadata
            .get("x-user-id")
            .and_then(|v| v.to_str().ok())
            .map(str::to_string)
            .ok_or_else(|| Status::invalid_argument("x-user-id metadata is required"))
    }

    fn to_proto(bot: &Bot) -> proto::richcrab::v1::Bot {
        proto::richcrab::v1::Bot {
            bot_id: Some(proto::richcrab::v1::BotId {
                value: bot.id.to_string(),
            }),
            name: bot.username.clone(),
            version: "v1".to_string(),
            status: "registered".to_string(),
            registered_at: Some(prost_types::Timestamp {
                seconds: bot.created_at.timestamp(),
                nanos: bot.created_at.timestamp_subsec_nanos() as i32,
            }),
        }
    }
}

#[tonic::async_trait]
impl proto::richcrab::v1::bot_service_server::BotService for BotServiceImpl {
    async fn register_bot(
        &self,
        request: Request<proto::richcrab::v1::RegisterBotRequest>,
    ) -> Result<Response<proto::richcrab::v1::RegisterBotResponse>, Status> {
        let actor = Self::actor_user_id(request.metadata())?;
        self.check_and_report(&actor, "REGISTER_BOT").await?;

        let req = request.into_inner();
        if req.name.trim().is_empty() {
            return Err(Status::invalid_argument("name is required"));
        }

        let now = Utc::now();
        let bot = Bot {
            id: Uuid::new_v4(),
            user_id: Uuid::parse_str(&actor)
                .map_err(|_| Status::invalid_argument("x-user-id must be uuid"))?,
            telegram_bot_id: rand::random::<i64>().abs(),
            username: req.name,
            token_encrypted: req.endpoint,
            webhook_secret: Uuid::new_v4().to_string(),
            created_at: now,
        };
        self.repository
            .create(&bot)
            .await
            .map_err(|e| Status::internal(format!("create failed: {e}")))?;

        Ok(Response::new(proto::richcrab::v1::RegisterBotResponse {
            bot: Some(Self::to_proto(&bot)),
            error: None,
        }))
    }

    async fn remove_bot(
        &self,
        request: Request<proto::richcrab::v1::RemoveBotRequest>,
    ) -> Result<Response<proto::richcrab::v1::RemoveBotResponse>, Status> {
        let actor = Self::actor_user_id(request.metadata())?;
        self.check_and_report(&actor, "BOT_COMMAND").await?;

        let id = request
            .into_inner()
            .bot_id
            .map(|v| v.value)
            .ok_or_else(|| Status::invalid_argument("bot_id is required"))?;
        let removed = self
            .repository
            .remove(Uuid::parse_str(&id).map_err(|_| Status::invalid_argument("bot_id invalid"))?)
            .await
            .map_err(|e| Status::internal(format!("remove failed: {e}")))?;

        Ok(Response::new(proto::richcrab::v1::RemoveBotResponse {
            removed,
            error: None,
        }))
    }

    async fn list_bots(
        &self,
        request: Request<proto::richcrab::v1::ListBotsRequest>,
    ) -> Result<Response<proto::richcrab::v1::ListBotsResponse>, Status> {
        let actor = Self::actor_user_id(request.metadata())?;
        self.check_and_report(&actor, "BOT_COMMAND").await?;

        let bots = self
            .repository
            .list()
            .await
            .map_err(|e| Status::internal(format!("list failed: {e}")))?;
        Ok(Response::new(proto::richcrab::v1::ListBotsResponse {
            bots: bots.iter().map(Self::to_proto).collect(),
            error: None,
        }))
    }

    async fn get_bot_status(
        &self,
        request: Request<proto::richcrab::v1::GetBotStatusRequest>,
    ) -> Result<Response<proto::richcrab::v1::GetBotStatusResponse>, Status> {
        let actor = Self::actor_user_id(request.metadata())?;
        self.check_and_report(&actor, "BOT_COMMAND").await?;

        let id = request
            .into_inner()
            .bot_id
            .map(|v| v.value)
            .ok_or_else(|| Status::invalid_argument("bot_id is required"))?;
        let bot = self
            .repository
            .find_by_id(
                Uuid::parse_str(&id).map_err(|_| Status::invalid_argument("bot_id invalid"))?,
            )
            .await
            .map_err(|e| Status::internal(format!("read failed: {e}")))?;

        Ok(Response::new(proto::richcrab::v1::GetBotStatusResponse {
            bot: bot.as_ref().map(Self::to_proto),
            error: None,
        }))
    }
}
