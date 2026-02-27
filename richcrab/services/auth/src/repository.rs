use sqlx::{PgPool, Row};
use uuid::Uuid;

#[derive(Debug, Clone)]
pub struct StoredUser {
    pub id: String,
    pub email: String,
    pub display_name: String,
    pub avatar_url: String,
    pub role: String,
    pub banned: bool,
}

pub struct AuthRepository {
    pool: PgPool,
}

impl AuthRepository {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    pub async fn ensure_schema(&self) -> sqlx::Result<()> {
        sqlx::query("CREATE EXTENSION IF NOT EXISTS pgcrypto;")
            .execute(&self.pool)
            .await?;
        sqlx::query(
            "CREATE TABLE IF NOT EXISTS gateway_users (
                id UUID PRIMARY KEY,
                email TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                display_name TEXT NOT NULL,
                avatar_url TEXT,
                role TEXT NOT NULL DEFAULT 'user',
                banned BOOLEAN NOT NULL DEFAULT FALSE,
                ban_reason TEXT,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )",
        )
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    pub async fn create_user(
        &self,
        email: &str,
        password: &str,
        display_name: &str,
    ) -> Result<StoredUser, sqlx::Error> {
        let row = sqlx::query(
            "INSERT INTO gateway_users (id, email, password_hash, display_name)
             VALUES ($1, lower($2), crypt($3, gen_salt('bf', 12)), $4)
             RETURNING id, email, display_name, avatar_url, role, banned",
        )
        .bind(Uuid::new_v4())
        .bind(email)
        .bind(password)
        .bind(display_name)
        .fetch_one(&self.pool)
        .await?;
        Ok(Self::map_user(row))
    }

    pub async fn verify_password(
        &self,
        email: &str,
        password: &str,
    ) -> sqlx::Result<Option<StoredUser>> {
        let row = sqlx::query(
            "SELECT id, email, display_name, avatar_url, role, banned
             FROM gateway_users
             WHERE lower(email)=lower($1) AND password_hash = crypt($2, password_hash)",
        )
        .bind(email)
        .bind(password)
        .fetch_optional(&self.pool)
        .await?;
        Ok(row.map(Self::map_user))
    }

    pub async fn find_user_by_id(&self, user_id: &str) -> sqlx::Result<Option<StoredUser>> {
        let row = sqlx::query(
            "SELECT id, email, display_name, avatar_url, role, banned FROM gateway_users WHERE id=$1",
        )
        .bind(user_id)
        .fetch_optional(&self.pool)
        .await?;
        Ok(row.map(Self::map_user))
    }

    pub async fn update_profile(
        &self,
        user_id: &str,
        display_name: Option<&str>,
        avatar_url: Option<&str>,
    ) -> sqlx::Result<Option<StoredUser>> {
        let row = match (display_name, avatar_url) {
            (Some(dn), Some(au)) => {
                sqlx::query(
                    "UPDATE gateway_users SET display_name=$2, avatar_url=$3, updated_at=NOW()
                     WHERE id = $1 RETURNING id, email, display_name, avatar_url, role, banned",
                )
                .bind(user_id)
                .bind(dn)
                .bind(au)
                .fetch_optional(&self.pool)
                .await?
            }
            (Some(dn), None) => {
                sqlx::query(
                    "UPDATE gateway_users SET display_name=$2, updated_at=NOW()
                     WHERE id = $1 RETURNING id, email, display_name, avatar_url, role, banned",
                )
                .bind(user_id)
                .bind(dn)
                .fetch_optional(&self.pool)
                .await?
            }
            (None, Some(au)) => {
                sqlx::query(
                    "UPDATE gateway_users SET avatar_url=$2, updated_at=NOW()
                     WHERE id = $1 RETURNING id, email, display_name, avatar_url, role, banned",
                )
                .bind(user_id)
                .bind(au)
                .fetch_optional(&self.pool)
                .await?
            }
            (None, None) => return Ok(None),
        };
        Ok(row.map(Self::map_user))
    }

    pub async fn change_password(
        &self,
        user_id: &str,
        current: &str,
        new_password: &str,
    ) -> sqlx::Result<bool> {
        let result = sqlx::query(
            "UPDATE gateway_users
             SET password_hash = crypt($3, gen_salt('bf', 12)), updated_at = NOW()
             WHERE id = $1 AND password_hash = crypt($2, password_hash)",
        )
        .bind(user_id)
        .bind(current)
        .bind(new_password)
        .execute(&self.pool)
        .await?;
        Ok(result.rows_affected() > 0)
    }

    pub async fn set_user_ban(
        &self,
        user_id: &str,
        banned: bool,
        reason: &str,
    ) -> sqlx::Result<bool> {
        let result = sqlx::query(
            "UPDATE gateway_users SET banned=$2, ban_reason=$3, updated_at=NOW() WHERE id=$1",
        )
        .bind(user_id)
        .bind(banned)
        .bind(reason)
        .execute(&self.pool)
        .await?;
        Ok(result.rows_affected() > 0)
    }

    pub async fn load_admin_stats(&self) -> sqlx::Result<(i64, i64, i64)> {
        let users: i64 = sqlx::query_scalar("SELECT count(*) FROM gateway_users")
            .fetch_one(&self.pool)
            .await?;
        let games: i64 = sqlx::query_scalar("SELECT count(*) FROM quizzes")
            .fetch_one(&self.pool)
            .await?;
        let active: i64 =
            sqlx::query_scalar("SELECT count(*) FROM rooms WHERE state IN ('lobby','in_progress')")
                .fetch_one(&self.pool)
                .await?;
        Ok((users, games, active))
    }

    fn map_user(row: sqlx::postgres::PgRow) -> StoredUser {
        StoredUser {
            id: row.get::<Uuid, _>("id").to_string(),
            email: row.get("email"),
            display_name: row.get("display_name"),
            avatar_url: row
                .get::<Option<String>, _>("avatar_url")
                .unwrap_or_default(),
            role: row.get("role"),
            banned: row.get("banned"),
        }
    }
}
