use chrono::{DateTime, Utc};
use sqlx::{PgPool, Row};
use uuid::Uuid;

#[derive(Debug, Clone)]
pub struct User {
    pub id: Uuid,
    pub telegram_user_id: i64,
    pub display_name: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

pub struct UserRepository {
    pool: PgPool,
}

impl UserRepository {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    pub async fn upsert(&self, user: &User) -> sqlx::Result<()> {
        sqlx::query(
            "INSERT INTO users (id, telegram_user_id, display_name, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (telegram_user_id)
             DO UPDATE SET display_name = EXCLUDED.display_name, updated_at = NOW()",
        )
        .bind(user.id)
        .bind(user.telegram_user_id)
        .bind(&user.display_name)
        .bind(user.created_at)
        .bind(user.updated_at)
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    pub async fn find_by_telegram_id(&self, telegram_user_id: i64) -> sqlx::Result<Option<User>> {
        let row = sqlx::query(
            "SELECT id, telegram_user_id, display_name, created_at, updated_at
             FROM users
             WHERE telegram_user_id = $1",
        )
        .bind(telegram_user_id)
        .fetch_optional(&self.pool)
        .await?;

        Ok(row.map(|row| User {
            id: row.get("id"),
            telegram_user_id: row.get("telegram_user_id"),
            display_name: row.get("display_name"),
            created_at: row.get("created_at"),
            updated_at: row.get("updated_at"),
        }))
    }
}
