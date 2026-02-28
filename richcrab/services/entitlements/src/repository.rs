use chrono::NaiveDate;
use sqlx::{PgPool, Row};
use uuid::Uuid;

#[derive(Debug, Clone)]
pub struct Plan {
    pub code: String,
    pub monthly_quota: i32,
}

#[derive(Debug, Clone, Default)]
pub struct UsageCounter {
    pub rooms_created: i32,
    pub rooms_started: i32,
    pub bots_registered: i32,
    pub ai_jobs_started: i32,
    pub quizzes_created_count: i32,
    pub messages_sent_count: i32,
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

pub struct UserRepository {
    pool: PgPool,
}

fn synthetic_telegram_user_id(user_id: Uuid) -> i64 {
    let raw = (user_id.as_u128() & 0x7fff_ffff_ffff_ffff) as i64;
    if raw == 0 {
        1
    } else {
        raw
    }
}

impl UserRepository {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    pub async fn ensure_exists(&self, user_id: Uuid) -> sqlx::Result<()> {
        sqlx::query(
            "INSERT INTO users (id, telegram_user_id, display_name)
             VALUES ($1, $2, $3)
             ON CONFLICT (id) DO NOTHING",
        )
        .bind(user_id)
        .bind(synthetic_telegram_user_id(user_id))
        .bind("Gateway user")
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    pub async fn find_plan_code(&self, user_id: Uuid) -> sqlx::Result<Option<String>> {
        let row = sqlx::query(
            "SELECT plan_code
             FROM users
             WHERE id = $1",
        )
        .bind(user_id)
        .fetch_optional(&self.pool)
        .await?;

        Ok(row.and_then(|row| row.get::<Option<String>, _>("plan_code")))
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
            "SELECT rooms_created, rooms_started, bots_registered, ai_jobs_started, quizzes_created_count, messages_sent_count
             FROM usage_counters
             WHERE user_id = $1 AND period_start = $2",
        )
        .bind(user_id)
        .bind(period_start)
        .fetch_optional(&self.pool)
        .await?;

        Ok(row.map(|row| UsageCounter {
            rooms_created: row.get("rooms_created"),
            rooms_started: row.get("rooms_started"),
            bots_registered: row.get("bots_registered"),
            ai_jobs_started: row.get("ai_jobs_started"),
            quizzes_created_count: row.get("quizzes_created_count"),
            messages_sent_count: row.get("messages_sent_count"),
        }))
    }

    #[allow(clippy::too_many_arguments)]
    pub async fn increment(
        &self,
        user_id: Uuid,
        period_start: NaiveDate,
        rooms_created: i32,
        rooms_started: i32,
        bots_registered: i32,
        ai_jobs_started: i32,
        quizzes_created_count: i32,
        messages_sent_count: i32,
    ) -> sqlx::Result<()> {
        sqlx::query(
            "INSERT INTO usage_counters (
                id, user_id, period_start,
                rooms_created, rooms_started, bots_registered, ai_jobs_started, quizzes_created_count, messages_sent_count,
                quizzes_created, messages_sent,
                created_at, updated_at
             )
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW())
             ON CONFLICT (user_id, period_start)
             DO UPDATE SET
                rooms_created = usage_counters.rooms_created + EXCLUDED.rooms_created,
                rooms_started = usage_counters.rooms_started + EXCLUDED.rooms_started,
                bots_registered = usage_counters.bots_registered + EXCLUDED.bots_registered,
                ai_jobs_started = usage_counters.ai_jobs_started + EXCLUDED.ai_jobs_started,
                quizzes_created_count = usage_counters.quizzes_created_count + EXCLUDED.quizzes_created_count,
                messages_sent_count = usage_counters.messages_sent_count + EXCLUDED.messages_sent_count,
                quizzes_created = usage_counters.quizzes_created + EXCLUDED.quizzes_created,
                messages_sent = usage_counters.messages_sent + EXCLUDED.messages_sent,
                updated_at = NOW()",
        )
        .bind(Uuid::new_v4())
        .bind(user_id)
        .bind(period_start)
        .bind(rooms_created)
        .bind(rooms_started)
        .bind(bots_registered)
        .bind(ai_jobs_started)
        .bind(quizzes_created_count)
        .bind(messages_sent_count)
        .bind(quizzes_created_count)
        .bind(messages_sent_count)
        .execute(&self.pool)
        .await?;

        Ok(())
    }
}
