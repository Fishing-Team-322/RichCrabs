use chrono::Utc;
use tracing::info;
use uuid::Uuid;

use crate::{
    application::error::AppError,
    infrastructure::entitlements_guard::EntitlementsGuard,
    providers::telegram_client::TelegramClient,
    repository::{Bot, BotRepository},
    security::token_crypto,
};

pub struct BotManagement {
    repository: BotRepository,
    entitlements: EntitlementsGuard,
    telegram: TelegramClient,
    encryption_key: String,
}

impl BotManagement {
    pub fn new(
        repository: BotRepository,
        entitlements: EntitlementsGuard,
        telegram: TelegramClient,
        encryption_key: String,
    ) -> Self {
        Self {
            repository,
            entitlements,
            telegram,
            encryption_key,
        }
    }

    pub async fn register_bot(
        &self,
        actor: &str,
        endpoint: &str,
    ) -> Result<proto::richcrab::v1::Bot, AppError> {
        self.entitlements
            .check_and_report(actor, "REGISTER_BOT")
            .await?;
        if endpoint.trim().is_empty() {
            return Err(AppError::InvalidArgument(
                "endpoint is required and must be bot token".to_string(),
            ));
        }

        let actor_id = Uuid::parse_str(actor)
            .map_err(|_| AppError::InvalidArgument("x-user-id must be uuid".to_string()))?;
        let me = self.telegram.fetch_me(endpoint).await?;
        let webhook_secret = Uuid::new_v4().as_simple().to_string();
        let encrypted_token = token_crypto::encrypt_token(&self.encryption_key, endpoint)
            .map_err(|e| AppError::FailedPrecondition(e.to_string()))?;

        let now = Utc::now();
        let bot = Bot {
            id: Uuid::new_v4(),
            user_id: actor_id,
            telegram_bot_id: me.id,
            username: me.username,
            token_encrypted: encrypted_token,
            webhook_secret: webhook_secret.clone(),
            enabled: true,
            disabled_at: None,
            created_at: now,
        };

        self.repository
            .create(&bot)
            .await
            .map_err(|e| AppError::Internal(format!("create failed: {e}")))?;

        if let Err(error) = self
            .telegram
            .set_webhook(endpoint, bot.id, &webhook_secret)
            .await
        {
            let _ = self.repository.remove_by_user(bot.id, actor_id).await;
            return Err(error.into());
        }

        Ok(to_proto(&bot, "registered".to_string()))
    }

    pub async fn remove_bot(&self, actor: &str, bot_id: &str) -> Result<bool, AppError> {
        self.entitlements
            .check_and_report(actor, "BOT_COMMAND")
            .await?;
        let actor_id = Uuid::parse_str(actor)
            .map_err(|_| AppError::InvalidArgument("x-user-id must be uuid".to_string()))?;
        let parsed_id = Uuid::parse_str(bot_id)
            .map_err(|_| AppError::InvalidArgument("bot_id invalid".to_string()))?;

        if let Some(bot) = self
            .repository
            .find_by_id(parsed_id)
            .await
            .map_err(|e| AppError::Internal(format!("read failed: {e}")))?
        {
            if bot.user_id == actor_id {
                if let Ok(token) =
                    token_crypto::decrypt_token(&self.encryption_key, &bot.token_encrypted)
                {
                    self.telegram.delete_webhook(&token).await;
                }
            }
        }

        self.repository
            .remove_by_user(parsed_id, actor_id)
            .await
            .map_err(|e| AppError::Internal(format!("remove failed: {e}")))
    }

    pub async fn list_bots(&self, actor: &str) -> Result<Vec<proto::richcrab::v1::Bot>, AppError> {
        self.entitlements
            .check_and_report(actor, "BOT_COMMAND")
            .await?;
        let actor_id = Uuid::parse_str(actor)
            .map_err(|_| AppError::InvalidArgument("x-user-id must be uuid".to_string()))?;

        let bots = self
            .repository
            .list_by_user(actor_id)
            .await
            .map_err(|e| AppError::Internal(format!("list failed: {e}")))?;

        Ok(bots
            .iter()
            .map(|bot| {
                let status = if bot.enabled {
                    "registered"
                } else {
                    "disabled"
                };
                to_proto(bot, status.to_string())
            })
            .collect())
    }

    pub async fn get_bot_status(
        &self,
        actor: &str,
        role: &str,
        bot_id: &str,
    ) -> Result<proto::richcrab::v1::Bot, AppError> {
        self.entitlements
            .check_and_report(actor, "BOT_COMMAND")
            .await?;
        let actor_id = Uuid::parse_str(actor)
            .map_err(|_| AppError::InvalidArgument("x-user-id must be uuid".to_string()))?;

        let bot = self
            .repository
            .find_by_id(
                Uuid::parse_str(bot_id)
                    .map_err(|_| AppError::InvalidArgument("bot_id invalid".to_string()))?,
            )
            .await
            .map_err(|e| AppError::Internal(format!("read failed: {e}")))?
            .ok_or_else(|| AppError::NotFound("bot not found".to_string()))?;

        if bot.user_id != actor_id && role != "admin" {
            return Err(AppError::PermissionDenied(
                "bot belongs to another user".to_string(),
            ));
        }

        if !bot.enabled {
            return Ok(to_proto(&bot, "disabled".to_string()));
        }

        let token = token_crypto::decrypt_token(&self.encryption_key, &bot.token_encrypted)
            .map_err(|e| AppError::Internal(e.to_string()))?;
        let status = self
            .telegram
            .get_webhook_status(&token)
            .await
            .unwrap_or_else(|e| format!("webhook_check_failed:{e}"));

        Ok(to_proto(&bot, status))
    }

    pub async fn update_bot_status(
        &self,
        actor: &str,
        role: &str,
        bot_id: &str,
        enabled: bool,
        reason: Option<&str>,
    ) -> Result<proto::richcrab::v1::Bot, AppError> {
        self.entitlements
            .check_and_report(actor, "BOT_COMMAND")
            .await?;

        let actor_id = Uuid::parse_str(actor)
            .map_err(|_| AppError::InvalidArgument("x-user-id must be uuid".to_string()))?;
        let parsed_id = Uuid::parse_str(bot_id)
            .map_err(|_| AppError::InvalidArgument("bot_id invalid".to_string()))?;

        let existing = self
            .repository
            .find_by_id(parsed_id)
            .await
            .map_err(|e| AppError::Internal(format!("read failed: {e}")))?
            .ok_or_else(|| AppError::NotFound("bot not found".to_string()))?;

        if existing.user_id != actor_id && role != "admin" {
            return Err(AppError::PermissionDenied(
                "bot belongs to another user".to_string(),
            ));
        }

        let updated = self
            .repository
            .update_enabled_with_audit(parsed_id, enabled, actor_id, reason)
            .await
            .map_err(|e| AppError::Internal(format!("update failed: {e}")))?
            .ok_or_else(|| AppError::NotFound("bot not found".to_string()))?;

        info!(
            bot_id = %updated.id,
            actor_user_id = %actor_id,
            enabled = updated.enabled,
            "bot status changed"
        );

        Ok(to_proto(
            &updated,
            if updated.enabled {
                "registered".to_string()
            } else {
                "disabled".to_string()
            },
        ))
    }
}

fn to_proto(bot: &Bot, status: String) -> proto::richcrab::v1::Bot {
    proto::richcrab::v1::Bot {
        bot_id: Some(proto::richcrab::v1::BotId {
            value: bot.id.to_string(),
        }),
        name: bot.username.clone(),
        version: "v1".to_string(),
        status,
        registered_at: Some(prost_types::Timestamp {
            seconds: bot.created_at.timestamp(),
            nanos: bot.created_at.timestamp_subsec_nanos() as i32,
        }),
    }
}
