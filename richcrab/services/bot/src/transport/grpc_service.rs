use tonic::{Request, Response, Status};

use crate::{
    application::{bot_management::BotManagement, error::AppError},
    providers::error::ProviderError,
    transport::authz,
};

pub struct BotGrpcService {
    app: BotManagement,
}

impl BotGrpcService {
    pub fn new(app: BotManagement) -> Self {
        Self { app }
    }
}

fn map_error(error: AppError) -> Status {
    match error {
        AppError::InvalidArgument(msg) => Status::invalid_argument(msg),
        AppError::PermissionDenied(msg) => Status::permission_denied(msg),
        AppError::NotFound(msg) => Status::not_found(msg),
        AppError::FailedPrecondition(msg) => Status::failed_precondition(msg),
        AppError::Unavailable(msg) => Status::unavailable(msg),
        AppError::Internal(msg) => Status::internal(msg),
        AppError::Provider(provider_error) => match provider_error {
            ProviderError::Timeout(msg) => Status::deadline_exceeded(msg),
            ProviderError::Unavailable(msg) => Status::unavailable(msg),
            ProviderError::InvalidInput(msg) => Status::invalid_argument(msg),
            ProviderError::FailedPrecondition(msg) => Status::failed_precondition(msg),
            ProviderError::Internal(msg) => Status::internal(msg),
        },
    }
}

#[tonic::async_trait]
impl proto::richcrab::v1::bot_service_server::BotService for BotGrpcService {
    async fn register_bot(
        &self,
        request: Request<proto::richcrab::v1::RegisterBotRequest>,
    ) -> Result<Response<proto::richcrab::v1::RegisterBotResponse>, Status> {
        let actor = authz::actor_user_id(request.metadata()).map_err(map_error)?;
        let req = request.into_inner();

        let bot = self
            .app
            .register_bot(&actor, &req.endpoint)
            .await
            .map_err(map_error)?;

        Ok(Response::new(proto::richcrab::v1::RegisterBotResponse {
            bot: Some(bot),
            error: None,
        }))
    }

    async fn remove_bot(
        &self,
        request: Request<proto::richcrab::v1::RemoveBotRequest>,
    ) -> Result<Response<proto::richcrab::v1::RemoveBotResponse>, Status> {
        let actor = authz::actor_user_id(request.metadata()).map_err(map_error)?;
        let bot_id = request
            .into_inner()
            .bot_id
            .map(|v| v.value)
            .ok_or_else(|| Status::invalid_argument("bot_id is required"))?;

        let removed = self
            .app
            .remove_bot(&actor, &bot_id)
            .await
            .map_err(map_error)?;

        Ok(Response::new(proto::richcrab::v1::RemoveBotResponse {
            removed,
            error: None,
        }))
    }

    async fn list_bots(
        &self,
        request: Request<proto::richcrab::v1::ListBotsRequest>,
    ) -> Result<Response<proto::richcrab::v1::ListBotsResponse>, Status> {
        let actor = authz::actor_user_id(request.metadata()).map_err(map_error)?;

        let bots = self.app.list_bots(&actor).await.map_err(map_error)?;

        Ok(Response::new(proto::richcrab::v1::ListBotsResponse {
            bots,
            error: None,
        }))
    }

    async fn get_bot_status(
        &self,
        request: Request<proto::richcrab::v1::GetBotStatusRequest>,
    ) -> Result<Response<proto::richcrab::v1::GetBotStatusResponse>, Status> {
        let actor = authz::actor_user_id(request.metadata()).map_err(map_error)?;
        let role = authz::actor_role(request.metadata());
        let bot_id = request
            .into_inner()
            .bot_id
            .map(|v| v.value)
            .ok_or_else(|| Status::invalid_argument("bot_id is required"))?;

        let bot = self
            .app
            .get_bot_status(&actor, &role, &bot_id)
            .await
            .map_err(map_error)?;

        Ok(Response::new(proto::richcrab::v1::GetBotStatusResponse {
            bot: Some(bot),
            error: None,
        }))
    }

    async fn update_bot_status(
        &self,
        request: Request<proto::richcrab::v1::UpdateBotStatusRequest>,
    ) -> Result<Response<proto::richcrab::v1::UpdateBotStatusResponse>, Status> {
        let actor = authz::actor_user_id(request.metadata()).map_err(map_error)?;
        let role = authz::actor_role(request.metadata());
        let req = request.into_inner();
        let bot_id = req
            .bot_id
            .map(|v| v.value)
            .ok_or_else(|| Status::invalid_argument("bot_id is required"))?;

        let bot = self
            .app
            .update_bot_status(&actor, &role, &bot_id, req.enabled, req.reason.as_deref())
            .await
            .map_err(map_error)?;

        Ok(Response::new(
            proto::richcrab::v1::UpdateBotStatusResponse {
                bot: Some(bot),
                error: None,
            },
        ))
    }
}
