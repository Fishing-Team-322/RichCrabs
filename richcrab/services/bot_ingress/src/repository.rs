use sqlx::{PgPool, Row};

#[derive(Debug, Clone)]
pub struct BotSecret {
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
            "SELECT webhook_secret
             FROM bots
             WHERE id::text = $1 OR concat('bot_', replace(id::text, '-', '')) = $1",
        )
        .bind(bot_id)
        .fetch_optional(&self.pool)
        .await?;

        Ok(row.map(|row| BotSecret {
            webhook_secret: row.get("webhook_secret"),
        }))
    }
}
