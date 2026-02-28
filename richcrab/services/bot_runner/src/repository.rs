use sqlx::{PgPool, Row};
use uuid::Uuid;
#[derive(Debug, Clone)]
pub struct BotRunnerBot {
    pub user_id: Uuid,
    pub token_encrypted: String,
    pub enabled: bool,
}

#[derive(Clone)]
pub struct BotRunnerRepository {
    pool: PgPool,
}

impl BotRunnerRepository {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    pub async fn find_bot_by_webhook_key(
        &self,
        bot_id: &str,
    ) -> sqlx::Result<Option<BotRunnerBot>> {
        let row = sqlx::query(
            "SELECT user_id, token_encrypted, enabled
             FROM bots
             WHERE id::text = $1 OR concat('bot_', replace(id::text, '-', '')) = $1",
        )
        .bind(bot_id)
        .fetch_optional(&self.pool)
        .await?;

        Ok(row.map(|row| BotRunnerBot {
            user_id: row.get("user_id"),
            token_encrypted: row.get("token_encrypted"),
            enabled: row.get("enabled"),
        }))
    }
}
