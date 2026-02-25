use chrono::NaiveDate;
use sqlx::{PgPool, Row};
use uuid::Uuid;

#[derive(Debug, Clone)]
pub struct Plan {
    pub code: String,
    pub monthly_quota: i32,
}

#[derive(Debug, Clone)]
pub struct UsageCounter {
    pub quizzes_created: i32,
    pub messages_sent: i32,
}

pub struct PlanRepository {
    pool: PgPool,
}

impl PlanRepository {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    pub async fn find_by_code(&self, code: &str) -> sqlx::Result<Option<Plan>> {
        let row = sqlx::query(
            "SELECT code, monthly_quota
             FROM plans
             WHERE code = $1",
        )
        .bind(code)
        .fetch_optional(&self.pool)
        .await?;

        Ok(row.map(|row| Plan {
            code: row.get("code"),
            monthly_quota: row.get("monthly_quota"),
        }))
    }

    pub async fn find_default(&self) -> sqlx::Result<Option<Plan>> {
        let row = sqlx::query(
            "SELECT code, monthly_quota
             FROM plans
             ORDER BY monthly_quota ASC
             LIMIT 1",
        )
        .fetch_optional(&self.pool)
        .await?;

        Ok(row.map(|row| Plan {
            code: row.get("code"),
            monthly_quota: row.get("monthly_quota"),
        }))
    }
}

pub struct UsageCounterRepository {
    pool: PgPool,
}

impl UsageCounterRepository {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    pub async fn find(
        &self,
        user_id: Uuid,
        period_start: NaiveDate,
    ) -> sqlx::Result<Option<UsageCounter>> {
        let row = sqlx::query(
            "SELECT quizzes_created, messages_sent
             FROM usage_counters
             WHERE user_id = $1 AND period_start = $2",
        )
        .bind(user_id)
        .bind(period_start)
        .fetch_optional(&self.pool)
        .await?;

        Ok(row.map(|row| UsageCounter {
            quizzes_created: row.get("quizzes_created"),
            messages_sent: row.get("messages_sent"),
        }))
    }

    pub async fn increment(
        &self,
        user_id: Uuid,
        period_start: NaiveDate,
        quizzes_created: i32,
        messages_sent: i32,
    ) -> sqlx::Result<()> {
        sqlx::query(
            "INSERT INTO usage_counters (id, user_id, period_start, quizzes_created, messages_sent, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
             ON CONFLICT (user_id, period_start)
             DO UPDATE SET
                quizzes_created = usage_counters.quizzes_created + EXCLUDED.quizzes_created,
                messages_sent = usage_counters.messages_sent + EXCLUDED.messages_sent,
                updated_at = NOW()",
        )
        .bind(Uuid::new_v4())
        .bind(user_id)
        .bind(period_start)
        .bind(quizzes_created)
        .bind(messages_sent)
        .execute(&self.pool)
        .await?;

        Ok(())
    }
}
