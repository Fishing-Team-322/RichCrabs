use chrono::{DateTime, Utc};
use sqlx::{PgPool, Row};
use uuid::Uuid;

#[derive(Debug, Clone)]
pub struct BotSecret {
    pub id: Uuid,
    pub user_id: Uuid,
    pub telegram_bot_id: i64,
    pub username: String,
    pub webhook_secret: String,
    pub created_at: DateTime<Utc>,
}

#[derive(Clone)]
pub struct BotIngressRepository {
    pool: PgPool,
}

impl BotIngressRepository {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    pub async fn find_secret(&self, telegram_bot_id: i64) -> sqlx::Result<Option<BotSecret>> {
        let row = sqlx::query(
            "SELECT id, user_id, telegram_bot_id, username, webhook_secret, created_at
             FROM bots
             WHERE telegram_bot_id = $1",
        )
        .bind(telegram_bot_id)
        .fetch_optional(&self.pool)
        .await?;

        Ok(row.map(|row| BotSecret {
            id: row.get("id"),
            user_id: row.get("user_id"),
            telegram_bot_id: row.get("telegram_bot_id"),
            username: row.get("username"),
            webhook_secret: row.get("webhook_secret"),
            created_at: row.get("created_at"),
        }))
    }
}
