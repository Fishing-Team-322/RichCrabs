use std::env;

pub const DATABASE_URL: &str = "DATABASE_URL";
pub const REDIS_URL: &str = "REDIS_URL";
pub const ENCRYPTION_KEY: &str = "ENCRYPTION_KEY";
pub const TELEGRAM_WEBHOOK_BASE_URL: &str = "TELEGRAM_WEBHOOK_BASE_URL";
pub const SERVICE_ADDR_GAME: &str = "SERVICE_ADDR_GAME";
pub const SERVICE_ADDR_JOIN: &str = "SERVICE_ADDR_JOIN";
pub const SERVICE_ADDR_QUIZ: &str = "SERVICE_ADDR_QUIZ";
pub const SERVICE_ADDR_ENTITLEMENTS: &str = "SERVICE_ADDR_ENTITLEMENTS";
pub const SERVICE_ADDR_BOT: &str = "SERVICE_ADDR_BOT";
pub const SERVICE_ADDR_BOT_INGRESS: &str = "SERVICE_ADDR_BOT_INGRESS";
pub const SERVICE_ADDR_AUTH: &str = "SERVICE_ADDR_AUTH";
pub const LOG_LEVEL: &str = "LOG_LEVEL";
pub const MIGRATIONS_DIR: &str = "MIGRATIONS_DIR";
pub const GIGACHAT_API_ADDR: &str = "GIGACHAT_API_ADDR";
pub const GIGACHAT_API_KEY: &str = "GIGACHAT_API_KEY";
pub const GIGACHAT_MODEL: &str = "GIGACHAT_MODEL";

#[derive(Debug, Clone)]
pub struct AppConfig {
    pub database_url: String,
    pub redis_url: String,
    pub encryption_key: String,
    pub telegram_webhook_base_url: String,
    pub service_addr_game: String,
    pub service_addr_join: String,
    pub service_addr_quiz: String,
    pub service_addr_entitlements: String,
    pub service_addr_bot: String,
    pub service_addr_bot_ingress: String,
    pub service_addr_auth: String,
    pub log_level: String,
}

impl AppConfig {
    pub fn from_env() -> Result<Self, env::VarError> {
        Ok(Self {
            database_url: env::var(DATABASE_URL)?,
            redis_url: env::var(REDIS_URL)?,
            encryption_key: env::var(ENCRYPTION_KEY)?,
            telegram_webhook_base_url: env::var(TELEGRAM_WEBHOOK_BASE_URL)?,
            service_addr_game: env::var(SERVICE_ADDR_GAME)?,
            service_addr_join: env::var(SERVICE_ADDR_JOIN)?,
            service_addr_quiz: env::var(SERVICE_ADDR_QUIZ)?,
            service_addr_entitlements: env::var(SERVICE_ADDR_ENTITLEMENTS)?,
            service_addr_bot: env::var(SERVICE_ADDR_BOT)?,
            service_addr_bot_ingress: env::var(SERVICE_ADDR_BOT_INGRESS)?,
            service_addr_auth: env::var(SERVICE_ADDR_AUTH)?,
            log_level: env::var(LOG_LEVEL)?,
        })
    }
}
