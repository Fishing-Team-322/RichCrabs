use sqlx::{PgPool, Row};
use uuid::Uuid;

#[derive(Debug, Clone)]
pub struct BotSecret {
    pub id: Uuid,
    pub user_id: Uuid,
    pub username: String,
    pub webhook_secret: String,
}

#[derive(Clone)]
pub struct BotIngressRepository {
    pool: PgPool,
}

impl BotIngressRepository {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    pub async fn find_secret(&self, bot_id: &str) -> sqlx::Result<Option<BotSecret>> {
        let row = sqlx::query(
            "SELECT id, user_id, username, webhook_secret
             FROM bots
             WHERE id::text = $1 OR concat('bot_', replace(id::text, '-', '')) = $1",
        )
        .bind(bot_id)
        .fetch_optional(&self.pool)
        .await?;

        Ok(row.map(|row| BotSecret {
            id: row.get("id"),
            user_id: row.get("user_id"),
            username: row.get("username"),
            webhook_secret: row.get("webhook_secret"),
        }))
    }
}
