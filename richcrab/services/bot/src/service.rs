use std::env;

use aes_gcm::{
    aead::{Aead, KeyInit},
    Aes256Gcm, Nonce,
};
use base64::Engine;
use chrono::Utc;
use reqwest::Client;
use serde::Deserialize;
use sqlx::PgPool;
use tonic::{Request, Response, Status};
use uuid::Uuid;

use crate::repository::{Bot, BotRepository};

#[derive(Debug, Deserialize)]
struct TelegramGetMeResponse {
    ok: bool,
    result: Option<TelegramBotInfo>,
    description: Option<String>,
}

#[derive(Debug, Deserialize)]
struct TelegramBotInfo {
    id: i64,
    username: String,
}

#[derive(Debug, Deserialize)]
struct TelegramSetWebhookResponse {
    ok: bool,
    description: Option<String>,
}

#[derive(Debug, Deserialize)]
struct TelegramDeleteWebhookResponse {
    ok: bool,
    description: Option<String>,
}

#[derive(Debug, Deserialize)]
struct TelegramWebhookInfoResponse {
    ok: bool,
    result: Option<TelegramWebhookInfo>,
    description: Option<String>,
}

#[derive(Debug, Deserialize)]
struct TelegramWebhookInfo {
    url: String,
    pending_update_count: u32,
    last_error_message: Option<String>,
    last_error_date: Option<i64>,
}

pub struct BotServiceImpl {
    repository: BotRepository,
    entitlements: proto::richcrab::v1::entitlements_service_client::EntitlementsServiceClient<
        tonic::transport::Channel,
    >,
    http: Client,
    encryption_key: String,
    webhook_base_url: String,
}

impl BotServiceImpl {
    pub fn new(
        pool: PgPool,
        entitlements: proto::richcrab::v1::entitlements_service_client::EntitlementsServiceClient<
            tonic::transport::Channel,
        >,
    ) -> Self {
        let encryption_key = env::var(shared::config::ENCRYPTION_KEY).unwrap_or_default();
        let webhook_base_url =
            env::var(shared::config::TELEGRAM_WEBHOOK_BASE_URL).unwrap_or_default();
        Self {
            repository: BotRepository::new(pool),
            entitlements,
            http: Client::new(),
            encryption_key,
            webhook_base_url,
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

    fn build_crypto_key(&self) -> Result<[u8; 32], Status> {
        if self.encryption_key.trim().is_empty() {
            return Err(Status::failed_precondition(
                "ENCRYPTION_KEY is not configured",
            ));
        }
        let hash = shared::crypto::sha256_hex(&self.encryption_key);
        let mut key = [0_u8; 32];
        hex::decode_to_slice(hash, &mut key)
            .map_err(|_| Status::failed_precondition("invalid ENCRYPTION_KEY"))?;
        Ok(key)
    }

    fn encrypt_token(&self, token: &str) -> Result<String, Status> {
        let key = self.build_crypto_key()?;
        let cipher = Aes256Gcm::new((&key).into());
        let nonce_bytes: [u8; 12] = rand::random();
        let nonce = Nonce::from_slice(&nonce_bytes);
        let ciphertext = cipher
            .encrypt(nonce, token.as_bytes())
            .map_err(|_| Status::internal("token encryption failed"))?;
        let mut payload = Vec::with_capacity(nonce_bytes.len() + ciphertext.len());
        payload.extend_from_slice(&nonce_bytes);
        payload.extend_from_slice(&ciphertext);
        Ok(base64::engine::general_purpose::STANDARD.encode(payload))
    }

    fn decrypt_token(&self, token_encrypted: &str) -> Result<String, Status> {
        let payload = base64::engine::general_purpose::STANDARD
            .decode(token_encrypted)
            .map_err(|_| Status::internal("token decrypt failed"))?;
        if payload.len() < 13 {
            return Err(Status::internal("token decrypt payload is invalid"));
        }
        let key = self.build_crypto_key()?;
        let cipher = Aes256Gcm::new((&key).into());
        let (nonce_bytes, ciphertext) = payload.split_at(12);
        let nonce = Nonce::from_slice(nonce_bytes);
        let plaintext = cipher
            .decrypt(nonce, ciphertext)
            .map_err(|_| Status::internal("token decrypt failed"))?;
        String::from_utf8(plaintext).map_err(|_| Status::internal("token decrypt utf8 failed"))
    }

    fn generate_webhook_secret(&self) -> String {
        Uuid::new_v4().as_simple().to_string()
    }

    async fn fetch_me(&self, token: &str) -> Result<TelegramBotInfo, Status> {
        let response = self
            .http
            .get(format!("https://api.telegram.org/bot{token}/getMe"))
            .send()
            .await
            .map_err(|e| Status::unavailable(format!("telegram getMe failed: {e}")))?;
        let body: TelegramGetMeResponse = response
            .json()
            .await
            .map_err(|e| Status::internal(format!("telegram getMe parse failed: {e}")))?;

        if !body.ok {
            return Err(Status::invalid_argument(
                body.description
                    .unwrap_or_else(|| "telegram rejected token".to_string()),
            ));
        }
        body.result
            .ok_or_else(|| Status::internal("telegram getMe missing result"))
    }

    async fn set_webhook(
        &self,
        token: &str,
        telegram_bot_id: i64,
        webhook_secret: &str,
    ) -> Result<(), Status> {
        if self.webhook_base_url.trim().is_empty() {
            return Err(Status::failed_precondition(
                "TELEGRAM_WEBHOOK_BASE_URL is not configured",
            ));
        }

        let webhook_url = format!(
            "{}/tg/{telegram_bot_id}/{webhook_secret}",
            self.webhook_base_url.trim_end_matches('/')
        );
        let response = self
            .http
            .post(format!("https://api.telegram.org/bot{token}/setWebhook"))
            .json(&serde_json::json!({
                "url": webhook_url,
                "secret_token": webhook_secret,
            }))
            .send()
            .await
            .map_err(|e| Status::unavailable(format!("telegram setWebhook failed: {e}")))?;
        let body: TelegramSetWebhookResponse = response
            .json()
            .await
            .map_err(|e| Status::internal(format!("telegram setWebhook parse failed: {e}")))?;
        if !body.ok {
            return Err(Status::failed_precondition(
                body.description
                    .unwrap_or_else(|| "telegram setWebhook failed".to_string()),
            ));
        }
        Ok(())
    }

    async fn get_webhook_status(&self, token: &str) -> Result<String, Status> {
        let response = self
            .http
            .get(format!(
                "https://api.telegram.org/bot{token}/getWebhookInfo"
            ))
            .send()
            .await
            .map_err(|e| Status::unavailable(format!("telegram getWebhookInfo failed: {e}")))?;
        let body: TelegramWebhookInfoResponse = response
            .json()
            .await
            .map_err(|e| Status::internal(format!("telegram webhook parse failed: {e}")))?;
        if !body.ok {
            return Ok(format!(
                "telegram_error:{}",
                body.description.unwrap_or_else(|| "unknown".to_string())
            ));
        }

        let Some(info) = body.result else {
            return Ok("webhook_unknown".to_string());
        };

        let mut status = format!(
            "webhook_set:{} pending:{}",
            info.url, info.pending_update_count
        );
        if let Some(last_error_message) = info.last_error_message {
            status.push_str(&format!(" error:{last_error_message}"));
        }
        if let Some(last_error_date) = info.last_error_date {
            status.push_str(&format!(" error_at:{last_error_date}"));
        }
        Ok(status)
    }

    async fn delete_webhook(&self, token: &str) {
        let response = self
            .http
            .post(format!("https://api.telegram.org/bot{token}/deleteWebhook"))
            .json(&serde_json::json!({"drop_pending_updates": false}))
            .send()
            .await;
        if let Ok(resp) = response {
            let _ = resp
                .json::<TelegramDeleteWebhookResponse>()
                .await
                .map(|body| {
                    let _ = body.ok;
                    let _ = body.description;
                });
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
        if req.endpoint.trim().is_empty() {
            return Err(Status::invalid_argument(
                "endpoint is required and must be bot token",
            ));
        }

        let actor_id = Uuid::parse_str(&actor)
            .map_err(|_| Status::invalid_argument("x-user-id must be uuid"))?;

        let me = self.fetch_me(&req.endpoint).await?;
        let webhook_secret = self.generate_webhook_secret();
        let encrypted_token = self.encrypt_token(&req.endpoint)?;

        let now = Utc::now();
        let bot = Bot {
            id: Uuid::new_v4(),
            user_id: actor_id,
            telegram_bot_id: me.id,
            username: me.username,
            token_encrypted: encrypted_token,
            webhook_secret: webhook_secret.clone(),
            created_at: now,
        };
        self.repository
            .create(&bot)
            .await
            .map_err(|e| Status::internal(format!("create failed: {e}")))?;

        if let Err(e) = self
            .set_webhook(&req.endpoint, bot.telegram_bot_id, &webhook_secret)
            .await
        {
            let _ = self.repository.remove_by_user(bot.id, actor_id).await;
            return Err(e);
        }

        Ok(Response::new(proto::richcrab::v1::RegisterBotResponse {
            bot: Some(Self::to_proto(&bot, "registered".to_string())),
            error: None,
        }))
    }

    async fn remove_bot(
        &self,
        request: Request<proto::richcrab::v1::RemoveBotRequest>,
    ) -> Result<Response<proto::richcrab::v1::RemoveBotResponse>, Status> {
        let actor = Self::actor_user_id(request.metadata())?;
        self.check_and_report(&actor, "BOT_COMMAND").await?;

        let actor_id = Uuid::parse_str(&actor)
            .map_err(|_| Status::invalid_argument("x-user-id must be uuid"))?;
        let id = request
            .into_inner()
            .bot_id
            .map(|v| v.value)
            .ok_or_else(|| Status::invalid_argument("bot_id is required"))?;
        let parsed_id =
            Uuid::parse_str(&id).map_err(|_| Status::invalid_argument("bot_id invalid"))?;

        if let Some(bot) = self
            .repository
            .find_by_id(parsed_id)
            .await
            .map_err(|e| Status::internal(format!("read failed: {e}")))?
        {
            if bot.user_id == actor_id {
                if let Ok(token) = self.decrypt_token(&bot.token_encrypted) {
                    self.delete_webhook(&token).await;
                }
            }
        }

        let removed = self
            .repository
            .remove_by_user(parsed_id, actor_id)
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
        let actor_id = Uuid::parse_str(&actor)
            .map_err(|_| Status::invalid_argument("x-user-id must be uuid"))?;

        let bots = self
            .repository
            .list_by_user(actor_id)
            .await
            .map_err(|e| Status::internal(format!("list failed: {e}")))?;

        Ok(Response::new(proto::richcrab::v1::ListBotsResponse {
            bots: bots
                .iter()
                .map(|bot| Self::to_proto(bot, "registered".to_string()))
                .collect(),
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

        let bot = bot.ok_or_else(|| Status::not_found("bot not found"))?;
        let token = self.decrypt_token(&bot.token_encrypted)?;
        let status = self
            .get_webhook_status(&token)
            .await
            .unwrap_or_else(|e| format!("webhook_check_failed:{e}"));

        Ok(Response::new(proto::richcrab::v1::GetBotStatusResponse {
            bot: Some(Self::to_proto(&bot, status)),
            error: None,
        }))
    }
}
