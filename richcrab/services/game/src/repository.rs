use chrono::{DateTime, NaiveDate, Utc};
use sqlx::{PgPool, Row};
use uuid::Uuid;

#[derive(Debug, Clone)]
pub struct UsageCounter {
    pub id: Uuid,
    pub user_id: Uuid,
    pub period_start: NaiveDate,
    pub quizzes_created: i32,
    pub messages_sent: i32,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

pub struct UsageCounterRepository {
    pool: PgPool,
}

impl UsageCounterRepository {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    pub async fn increment_messages(
        &self,
        user_id: Uuid,
        period_start: NaiveDate,
    ) -> sqlx::Result<()> {
        sqlx::query(
            "INSERT INTO usage_counters (id, user_id, period_start, quizzes_created, messages_sent, created_at, updated_at)
             VALUES ($1, $2, $3, 0, 1, NOW(), NOW())
             ON CONFLICT (user_id, period_start)
             DO UPDATE SET messages_sent = usage_counters.messages_sent + 1, updated_at = NOW()",
        )
        .bind(Uuid::new_v4())
        .bind(user_id)
        .bind(period_start)
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    pub async fn find(
        &self,
        user_id: Uuid,
        period_start: NaiveDate,
    ) -> sqlx::Result<Option<UsageCounter>> {
        let row = sqlx::query(
            "SELECT id, user_id, period_start, quizzes_created, messages_sent, created_at, updated_at
             FROM usage_counters
             WHERE user_id = $1 AND period_start = $2",
        )
        .bind(user_id)
        .bind(period_start)
        .fetch_optional(&self.pool)
        .await?;

        Ok(row.map(|row| UsageCounter {
            id: row.get("id"),
            user_id: row.get("user_id"),
            period_start: row.get("period_start"),
            quizzes_created: row.get("quizzes_created"),
            messages_sent: row.get("messages_sent"),
            created_at: row.get("created_at"),
            updated_at: row.get("updated_at"),
        }))
    }
}
