use chrono::{DateTime, Utc};
use sqlx::{PgPool, Row};
use uuid::Uuid;

#[derive(Debug, Clone)]
pub struct RoomChatMessage {
    pub id: Uuid,
    pub room_id: String,
    pub author: String,
    pub body: String,
    pub created_at: DateTime<Utc>,
}

#[derive(Clone)]
pub struct RoomChatRepository {
    pool: PgPool,
}

impl RoomChatRepository {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    pub async fn create(
        &self,
        room_id: &str,
        author: &str,
        body: &str,
    ) -> sqlx::Result<RoomChatMessage> {
        let id = Uuid::new_v4();
        let row = sqlx::query(
            "INSERT INTO room_chat_messages (id, room_id, author, body, created_at)
             VALUES ($1, $2, $3, $4, NOW())
             RETURNING id, room_id, author, body, created_at",
        )
        .bind(id)
        .bind(room_id)
        .bind(author)
        .bind(body)
        .fetch_one(&self.pool)
        .await?;

        Ok(Self::map(row))
    }

    pub async fn list_recent(
        &self,
        room_id: &str,
        limit: i64,
    ) -> sqlx::Result<Vec<RoomChatMessage>> {
        let rows = sqlx::query(
            "SELECT id, room_id, author, body, created_at
             FROM room_chat_messages
             WHERE room_id = $1
             ORDER BY created_at DESC
             LIMIT $2",
        )
        .bind(room_id)
        .bind(limit)
        .fetch_all(&self.pool)
        .await?;

        let mut messages: Vec<RoomChatMessage> = rows.into_iter().map(Self::map).collect();
        messages.reverse();
        Ok(messages)
    }

    fn map(row: sqlx::postgres::PgRow) -> RoomChatMessage {
        RoomChatMessage {
            id: row.get("id"),
            room_id: row.get("room_id"),
            author: row.get("author"),
            body: row.get("body"),
            created_at: row.get("created_at"),
        }
    }
}
