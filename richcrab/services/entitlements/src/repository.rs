use chrono::{DateTime, Utc};
use sqlx::{PgPool, Row};
use uuid::Uuid;

#[derive(Debug, Clone)]
pub struct Plan {
    pub id: Uuid,
    pub code: String,
    pub title: String,
    pub monthly_quota: i32,
    pub created_at: DateTime<Utc>,
}

pub struct PlanRepository {
    pool: PgPool,
}

impl PlanRepository {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    pub async fn create(&self, plan: &Plan) -> sqlx::Result<()> {
        sqlx::query(
            "INSERT INTO plans (id, code, title, monthly_quota, created_at)
             VALUES ($1, $2, $3, $4, $5)",
        )
        .bind(plan.id)
        .bind(&plan.code)
        .bind(&plan.title)
        .bind(plan.monthly_quota)
        .bind(plan.created_at)
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    pub async fn find_by_code(&self, code: &str) -> sqlx::Result<Option<Plan>> {
        let row = sqlx::query(
            "SELECT id, code, title, monthly_quota, created_at
             FROM plans
             WHERE code = $1",
        )
        .bind(code)
        .fetch_optional(&self.pool)
        .await?;

        Ok(row.map(|row| Plan {
            id: row.get("id"),
            code: row.get("code"),
            title: row.get("title"),
            monthly_quota: row.get("monthly_quota"),
            created_at: row.get("created_at"),
        }))
    }
}
