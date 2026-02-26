use chrono::{DateTime, Utc};
use serde_json::Value;
use sqlx::{PgPool, Row};
use uuid::Uuid;

#[derive(Debug, Clone)]
pub struct Quiz {
    pub id: Uuid,
    pub owner_user_id: Uuid,
    pub title: String,
    pub description: String,
    pub status: String,
    pub published_version: i32,
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
            "INSERT INTO quizzes (id, owner_user_id, title, description, status, published_version, questions_json, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)",
        )
        .bind(quiz.id)
        .bind(quiz.owner_user_id)
        .bind(&quiz.title)
        .bind(&quiz.description)
        .bind(&quiz.status)
        .bind(quiz.published_version)
        .bind(&quiz.questions_json)
        .bind(quiz.created_at)
        .bind(quiz.updated_at)
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    pub async fn update(&self, quiz: &Quiz) -> sqlx::Result<()> {
        sqlx::query(
            "UPDATE quizzes
             SET title = $2, description = $3, status = $4, questions_json = $5, updated_at = NOW()
             WHERE id = $1",
        )
        .bind(quiz.id)
        .bind(&quiz.title)
        .bind(&quiz.description)
        .bind(&quiz.status)
        .bind(&quiz.questions_json)
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    pub async fn delete(&self, quiz_id: Uuid) -> sqlx::Result<bool> {
        let result = sqlx::query("DELETE FROM quizzes WHERE id = $1")
            .bind(quiz_id)
            .execute(&self.pool)
            .await?;
        Ok(result.rows_affected() > 0)
    }

    pub async fn find_by_id(&self, quiz_id: Uuid) -> sqlx::Result<Option<Quiz>> {
        let row = sqlx::query(
            "SELECT id, owner_user_id, title, description, status, published_version, questions_json, created_at, updated_at
             FROM quizzes
             WHERE id = $1",
        )
        .bind(quiz_id)
        .fetch_optional(&self.pool)
        .await?;

        Ok(row.map(Self::map_quiz))
    }

    pub async fn find_published(
        &self,
        quiz_id: Uuid,
        version: Option<i32>,
    ) -> sqlx::Result<Option<Quiz>> {
        let row = if let Some(version) = version {
            sqlx::query(
                "SELECT q.id, q.owner_user_id, v.title, v.description, 'published' AS status, v.version AS published_version,
                        v.questions_json, q.created_at, q.updated_at
                 FROM quizzes q
                 JOIN quiz_versions v ON v.quiz_id = q.id
                 WHERE q.id = $1 AND v.version = $2",
            )
            .bind(quiz_id)
            .bind(version)
            .fetch_optional(&self.pool)
            .await?
        } else {
            sqlx::query(
                "SELECT q.id, q.owner_user_id, v.title, v.description, 'published' AS status, v.version AS published_version,
                        v.questions_json, q.created_at, q.updated_at
                 FROM quizzes q
                 JOIN quiz_versions v ON v.quiz_id = q.id
                 WHERE q.id = $1
                 ORDER BY v.version DESC
                 LIMIT 1",
            )
            .bind(quiz_id)
            .fetch_optional(&self.pool)
            .await?
        };

        Ok(row.map(Self::map_quiz))
    }

    pub async fn list(
        &self,
        owner_user_id: Option<Uuid>,
        page_size: i64,
        offset: i64,
    ) -> sqlx::Result<Vec<Quiz>> {
        let rows = if let Some(owner_user_id) = owner_user_id {
            sqlx::query(
                "SELECT id, owner_user_id, title, description, status, published_version, questions_json, created_at, updated_at
                 FROM quizzes
                 WHERE owner_user_id = $1
                 ORDER BY created_at DESC
                 LIMIT $2 OFFSET $3",
            )
            .bind(owner_user_id)
            .bind(page_size)
            .bind(offset)
            .fetch_all(&self.pool)
            .await?
        } else {
            sqlx::query(
                "SELECT id, owner_user_id, title, description, status, published_version, questions_json, created_at, updated_at
                 FROM quizzes
                 ORDER BY created_at DESC
                 LIMIT $1 OFFSET $2",
            )
            .bind(page_size)
            .bind(offset)
            .fetch_all(&self.pool)
            .await?
        };

        Ok(rows.into_iter().map(Self::map_quiz).collect())
    }

    pub async fn publish_snapshot(&self, quiz: &Quiz, next_version: i32) -> sqlx::Result<()> {
        let mut tx = self.pool.begin().await?;

        sqlx::query(
            "INSERT INTO quiz_versions (id, quiz_id, version, title, description, questions_json, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, NOW())",
        )
        .bind(Uuid::new_v4())
        .bind(quiz.id)
        .bind(next_version)
        .bind(&quiz.title)
        .bind(&quiz.description)
        .bind(&quiz.questions_json)
        .execute(&mut *tx)
        .await?;

        sqlx::query(
            "UPDATE quizzes
             SET status = 'published', published_version = $2, updated_at = NOW()
             WHERE id = $1",
        )
        .bind(quiz.id)
        .bind(next_version)
        .execute(&mut *tx)
        .await?;

        tx.commit().await?;
        Ok(())
    }

    fn map_quiz(row: sqlx::postgres::PgRow) -> Quiz {
        Quiz {
            id: row.get("id"),
            owner_user_id: row.get("owner_user_id"),
            title: row.get("title"),
            description: row.get("description"),
            status: row.get("status"),
            published_version: row.get("published_version"),
            questions_json: row.get("questions_json"),
            created_at: row.get("created_at"),
            updated_at: row.get("updated_at"),
        }
    }
}
