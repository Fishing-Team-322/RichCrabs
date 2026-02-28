use std::time::Duration;

use reqwest::Client;
use serde::Deserialize;
use tracing::warn;
use uuid::Uuid;

use crate::providers::error::ProviderError;

const TELEGRAM_CONNECT_TIMEOUT: Duration = Duration::from_secs(3);
const TELEGRAM_REQUEST_TIMEOUT: Duration = Duration::from_secs(10);
const TELEGRAM_READ_TIMEOUT: Duration = Duration::from_secs(10);
const TELEGRAM_MAX_RETRIES: usize = 3;
const TELEGRAM_RETRY_BASE_DELAY_MS: u64 = 200;

#[derive(Debug, Clone)]
pub struct TelegramClient {
    pub(crate) http: Client,
    api_base_url: String,
    webhook_base_url: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct TelegramBotInfo {
    pub id: i64,
    pub username: String,
}

#[derive(Debug, Deserialize)]
struct TelegramGetMeResponse {
    ok: bool,
    result: Option<TelegramBotInfo>,
    description: Option<String>,
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

impl TelegramClient {
    pub fn new(webhook_base_url: String) -> Self {
        let api_base_url = std::env::var("TELEGRAM_API_BASE_URL")
            .unwrap_or_else(|_| "https://api.telegram.org".to_string());
        Self {
            http: Client::builder()
                .connect_timeout(TELEGRAM_CONNECT_TIMEOUT)
                .timeout(TELEGRAM_REQUEST_TIMEOUT)
                .read_timeout(TELEGRAM_READ_TIMEOUT)
                .build()
                .expect("failed to build telegram reqwest client"),
            api_base_url,
            webhook_base_url,
        }
    }

    #[cfg(test)]
    pub fn with_base_urls(api_base_url: String, webhook_base_url: String) -> Self {
        Self {
            http: Client::builder()
                .no_proxy()
                .build()
                .expect("reqwest client"),
            api_base_url,
            webhook_base_url,
        }
    }

    pub async fn send_with_retry(
        &self,
        request_name: &'static str,
        mut build_request: impl FnMut() -> reqwest::RequestBuilder,
    ) -> Result<reqwest::Response, ProviderError> {
        for attempt in 1..=TELEGRAM_MAX_RETRIES {
            match build_request().send().await {
                Ok(response) => {
                    if !response.status().is_server_error() {
                        return Ok(response);
                    }

                    warn!(
                        request_name,
                        attempt,
                        max_attempts = TELEGRAM_MAX_RETRIES,
                        status = %response.status(),
                        "telegram server error response"
                    );

                    if attempt == TELEGRAM_MAX_RETRIES {
                        return Err(ProviderError::Unavailable(format!(
                            "telegram {request_name} failed with status {}",
                            response.status()
                        )));
                    }

                    let jitter_ms = rand::random::<u64>() % 100;
                    let backoff_ms = TELEGRAM_RETRY_BASE_DELAY_MS * attempt as u64 + jitter_ms;
                    tokio::time::sleep(Duration::from_millis(backoff_ms)).await;
                }
                Err(err) => {
                    let timed_out = err.is_timeout();
                    let should_retry = timed_out || err.is_connect();
                    if timed_out {
                        shared::observability::error("bot", "telegram_timeout");
                    }

                    warn!(
                        request_name,
                        attempt,
                        max_attempts = TELEGRAM_MAX_RETRIES,
                        timed_out,
                        should_retry,
                        error = %err,
                        "telegram request failed"
                    );

                    if !should_retry || attempt == TELEGRAM_MAX_RETRIES {
                        return if timed_out {
                            Err(ProviderError::Timeout(format!(
                                "telegram {request_name} timed out"
                            )))
                        } else {
                            Err(ProviderError::Unavailable(format!(
                                "telegram {request_name} failed: {err}"
                            )))
                        };
                    }

                    let jitter_ms = rand::random::<u64>() % 100;
                    let backoff_ms = TELEGRAM_RETRY_BASE_DELAY_MS * attempt as u64 + jitter_ms;
                    tokio::time::sleep(Duration::from_millis(backoff_ms)).await;
                }
            }
        }

        Err(ProviderError::Unavailable(format!(
            "telegram {request_name} failed after retries"
        )))
    }

    pub async fn fetch_me(&self, token: &str) -> Result<TelegramBotInfo, ProviderError> {
        let response = self
            .send_with_retry("getMe", || {
                self.http.get(format!(
                    "{}/bot{token}/getMe",
                    self.api_base_url.trim_end_matches('/')
                ))
            })
            .await?;

        let body: TelegramGetMeResponse = response
            .json()
            .await
            .map_err(|e| ProviderError::Internal(format!("telegram getMe parse failed: {e}")))?;

        if !body.ok {
            return Err(ProviderError::InvalidInput(
                body.description
                    .unwrap_or_else(|| "telegram rejected token".to_string()),
            ));
        }

        body.result
            .ok_or_else(|| ProviderError::Internal("telegram getMe missing result".to_string()))
    }

    pub async fn set_webhook(
        &self,
        token: &str,
        bot_id: Uuid,
        webhook_secret: &str,
    ) -> Result<(), ProviderError> {
        if self.webhook_base_url.trim().is_empty() {
            return Err(ProviderError::FailedPrecondition(
                "TELEGRAM_WEBHOOK_BASE_URL is not configured".to_string(),
            ));
        }

        let bot_key = format!("bot_{}", bot_id.simple());
        let webhook_url = format!(
            "{}/api/v1/telegram/webhook/{bot_key}/{webhook_secret}",
            self.webhook_base_url.trim_end_matches('/')
        );

        let response = self
            .send_with_retry("setWebhook", || {
                self.http
                    .post(format!(
                        "{}/bot{token}/setWebhook",
                        self.api_base_url.trim_end_matches('/')
                    ))
                    .json(&serde_json::json!({
                        "url": webhook_url,
                        "secret_token": webhook_secret,
                    }))
            })
            .await?;

        let body: TelegramSetWebhookResponse = response.json().await.map_err(|e| {
            ProviderError::Internal(format!("telegram setWebhook parse failed: {e}"))
        })?;

        if !body.ok {
            return Err(ProviderError::FailedPrecondition(
                body.description
                    .unwrap_or_else(|| "telegram setWebhook failed".to_string()),
            ));
        }

        Ok(())
    }

    pub async fn get_webhook_status(&self, token: &str) -> Result<String, ProviderError> {
        let response = self
            .send_with_retry("getWebhookInfo", || {
                self.http.get(format!(
                    "{}/bot{token}/getWebhookInfo",
                    self.api_base_url.trim_end_matches('/')
                ))
            })
            .await?;

        let body: TelegramWebhookInfoResponse = response
            .json()
            .await
            .map_err(|e| ProviderError::Internal(format!("telegram webhook parse failed: {e}")))?;

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

    pub async fn delete_webhook(&self, token: &str) {
        let response = self
            .send_with_retry("deleteWebhook", || {
                self.http
                    .post(format!(
                        "{}/bot{token}/deleteWebhook",
                        self.api_base_url.trim_end_matches('/')
                    ))
                    .json(&serde_json::json!({"drop_pending_updates": false}))
            })
            .await;

        if let Ok(resp) = response {
            let _ = resp
                .json::<TelegramDeleteWebhookResponse>()
                .await
                .map(|body| {
                    let _ = body.ok;
                    let _ = body.description;
                });
        } else if let Err(err) = response {
            warn!(error = %err, "telegram deleteWebhook failed");
        }
    }
}

#[cfg(test)]
mod tests {
    use httpmock::prelude::*;

    use super::TelegramClient;

    #[tokio::test]
    async fn send_with_retry_retries_on_server_error() {
        let server = MockServer::start();

        let mock_500 = server.mock(|when, then| {
            when.method(GET).path("/unstable");
            then.status(500).body("boom");
        });

        let client = TelegramClient::with_base_urls(server.base_url(), "http://localhost".into());
        let err = client
            .send_with_retry("unstable", || {
                client.http.get(format!("{}/unstable", server.base_url()))
            })
            .await
            .expect_err("request should fail");

        assert!(err.to_string().contains("status 500"));
        assert_eq!(mock_500.hits(), 3);
    }

    #[tokio::test]
    async fn send_with_retry_returns_error_when_connection_refused() {
        let client =
            TelegramClient::with_base_urls("http://127.0.0.1:1".into(), "http://localhost".into());

        let err = client
            .send_with_retry("getMe", || client.http.get("http://127.0.0.1:1/getMe"))
            .await
            .expect_err("must fail");

        assert!(err.to_string().contains("telegram getMe failed"));
    }
}
