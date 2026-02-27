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
    pub enabled: bool,
    pub disabled_at: Option<DateTime<Utc>>,
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
            "INSERT INTO bots (id, user_id, telegram_bot_id, username, token_encrypted, webhook_secret, enabled, disabled_at, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)",
        )
        .bind(bot.id)
        .bind(bot.user_id)
        .bind(bot.telegram_bot_id)
        .bind(&bot.username)
        .bind(&bot.token_encrypted)
        .bind(&bot.webhook_secret)
        .bind(bot.enabled)
        .bind(bot.disabled_at)
        .bind(bot.created_at)
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    pub async fn find_by_id(&self, id: Uuid) -> sqlx::Result<Option<Bot>> {
        let row = sqlx::query(
            "SELECT id, user_id, telegram_bot_id, username, token_encrypted, webhook_secret, enabled, disabled_at, created_at
             FROM bots
             WHERE id = $1",
        )
        .bind(id)
        .fetch_optional(&self.pool)
        .await?;

        Ok(row.map(|row| Bot {
            id: row.get("id"),
            user_id: row.get("user_id"),
            telegram_bot_id: row.get("telegram_bot_id"),
            username: row.get("username"),
            token_encrypted: row.get("token_encrypted"),
            webhook_secret: row.get("webhook_secret"),
            enabled: row.get("enabled"),
            disabled_at: row.get("disabled_at"),
            created_at: row.get("created_at"),
        }))
    }

    pub async fn list_by_user(&self, user_id: Uuid) -> sqlx::Result<Vec<Bot>> {
        let rows = sqlx::query(
            "SELECT id, user_id, telegram_bot_id, username, token_encrypted, webhook_secret, enabled, disabled_at, created_at
             FROM bots
             WHERE user_id = $1
             ORDER BY created_at DESC",
        )
        .bind(user_id)
        .fetch_all(&self.pool)
        .await?;

        Ok(rows
            .into_iter()
            .map(|row| Bot {
                id: row.get("id"),
                user_id: row.get("user_id"),
                telegram_bot_id: row.get("telegram_bot_id"),
                username: row.get("username"),
                token_encrypted: row.get("token_encrypted"),
                webhook_secret: row.get("webhook_secret"),
                enabled: row.get("enabled"),
                disabled_at: row.get("disabled_at"),
                created_at: row.get("created_at"),
            })
            .collect())
    }

    pub async fn update_enabled_with_audit(
        &self,
        id: Uuid,
        enabled: bool,
        actor_user_id: Uuid,
        reason: Option<&str>,
    ) -> sqlx::Result<Option<Bot>> {
        let mut tx = self.pool.begin().await?;
        let row = sqlx::query(
            "UPDATE bots
             SET enabled = $2,
                 disabled_at = CASE WHEN $2 THEN NULL ELSE NOW() END
             WHERE id = $1
             RETURNING id, user_id, telegram_bot_id, username, token_encrypted, webhook_secret, enabled, disabled_at, created_at",
        )
        .bind(id)
        .bind(enabled)
        .fetch_optional(&mut *tx)
        .await?;

        let Some(row) = row else {
            tx.commit().await?;
            return Ok(None);
        };

        sqlx::query(
            "INSERT INTO bot_status_audit (bot_id, actor_user_id, enabled, reason)
             VALUES ($1, $2, $3, $4)",
        )
        .bind(id)
        .bind(actor_user_id)
        .bind(enabled)
        .bind(reason)
        .execute(&mut *tx)
        .await?;

        tx.commit().await?;
        Ok(Some(Bot {
            id: row.get("id"),
            user_id: row.get("user_id"),
            telegram_bot_id: row.get("telegram_bot_id"),
            username: row.get("username"),
            token_encrypted: row.get("token_encrypted"),
            webhook_secret: row.get("webhook_secret"),
            enabled: row.get("enabled"),
            disabled_at: row.get("disabled_at"),
            created_at: row.get("created_at"),
        }))
    }

    pub async fn remove_by_user(&self, id: Uuid, user_id: Uuid) -> sqlx::Result<bool> {
        let result = sqlx::query("DELETE FROM bots WHERE id = $1 AND user_id = $2")
            .bind(id)
            .bind(user_id)
            .execute(&self.pool)
            .await?;
        Ok(result.rows_affected() > 0)
    }
}
