use chrono::{DateTime, Utc};
use sqlx::{PgPool, Row};
use uuid::Uuid;

#[derive(Debug, Clone)]
pub struct Bot {
    pub id: Uuid,
    pub user_id: Uuid,
    pub telegram_bot_id: i64,
    pub username: String,
    pub token_encrypted: String,
    pub webhook_secret: String,
    pub created_at: DateTime<Utc>,
}

pub struct BotRepository {
    pool: PgPool,
}

impl BotRepository {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    pub async fn create(&self, bot: &Bot) -> sqlx::Result<()> {
        sqlx::query(
            "INSERT INTO bots (id, user_id, telegram_bot_id, username, token_encrypted, webhook_secret, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7)",
        )
        .bind(bot.id)
        .bind(bot.user_id)
        .bind(bot.telegram_bot_id)
        .bind(&bot.username)
        .bind(&bot.token_encrypted)
        .bind(&bot.webhook_secret)
        .bind(bot.created_at)
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    pub async fn find_by_telegram_bot_id(&self, telegram_bot_id: i64) -> sqlx::Result<Option<Bot>> {
        let row = sqlx::query(
            "SELECT id, user_id, telegram_bot_id, username, token_encrypted, webhook_secret, created_at
             FROM bots
             WHERE telegram_bot_id = $1",
        )
        .bind(telegram_bot_id)
        .fetch_optional(&self.pool)
        .await?;

        Ok(row.map(|row| Bot {
            id: row.get("id"),
            user_id: row.get("user_id"),
            telegram_bot_id: row.get("telegram_bot_id"),
            username: row.get("username"),
            token_encrypted: row.get("token_encrypted"),
            webhook_secret: row.get("webhook_secret"),
            created_at: row.get("created_at"),
        }))
    }
}
