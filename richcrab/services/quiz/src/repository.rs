use chrono::{DateTime, Utc};
use serde_json::Value;
use sqlx::{PgPool, Row};
use uuid::Uuid;

#[derive(Debug, Clone)]
pub struct Quiz {
    pub id: Uuid,
    pub owner_user_id: Uuid,
    pub status: String,
    pub questions_json: Value,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

pub struct QuizRepository {
    pool: PgPool,
}

impl QuizRepository {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    pub async fn create(&self, quiz: &Quiz) -> sqlx::Result<()> {
        sqlx::query(
            "INSERT INTO quizzes (id, owner_user_id, status, questions_json, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6)",
        )
        .bind(quiz.id)
        .bind(quiz.owner_user_id)
        .bind(&quiz.status)
        .bind(&quiz.questions_json)
        .bind(quiz.created_at)
        .bind(quiz.updated_at)
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    pub async fn update_status(&self, quiz_id: Uuid, status: &str) -> sqlx::Result<()> {
        sqlx::query(
            "UPDATE quizzes
             SET status = $2, updated_at = NOW()
             WHERE id = $1",
        )
        .bind(quiz_id)
        .bind(status)
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    pub async fn find_by_id(&self, quiz_id: Uuid) -> sqlx::Result<Option<Quiz>> {
        let row = sqlx::query(
            "SELECT id, owner_user_id, status, questions_json, created_at, updated_at
             FROM quizzes
             WHERE id = $1",
        )
        .bind(quiz_id)
        .fetch_optional(&self.pool)
        .await?;

        Ok(row.map(|row| Quiz {
            id: row.get("id"),
            owner_user_id: row.get("owner_user_id"),
            status: row.get("status"),
            questions_json: row.get("questions_json"),
            created_at: row.get("created_at"),
            updated_at: row.get("updated_at"),
        }))
    }
}
