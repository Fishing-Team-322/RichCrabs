use std::sync::Arc;

use crate::repository::{RoomChatMessage, RoomChatRepository};

#[tonic::async_trait]
pub trait ChatRepositoryPort: Send + Sync {
    async fn create(
        &self,
        room_id: &str,
        author: &str,
        body: &str,
    ) -> sqlx::Result<RoomChatMessage>;
    async fn list_recent(&self, room_id: &str, limit: i64) -> sqlx::Result<Vec<RoomChatMessage>>;
}

pub type DynChatRepository = Arc<dyn ChatRepositoryPort>;

#[tonic::async_trait]
impl ChatRepositoryPort for RoomChatRepository {
    async fn create(
        &self,
        room_id: &str,
        author: &str,
        body: &str,
    ) -> sqlx::Result<RoomChatMessage> {
        RoomChatRepository::create(self, room_id, author, body).await
    }

    async fn list_recent(&self, room_id: &str, limit: i64) -> sqlx::Result<Vec<RoomChatMessage>> {
        RoomChatRepository::list_recent(self, room_id, limit).await
    }
}
