use std::time::Instant;

use tokio::sync::oneshot;
use tonic::{Request, Response, Status};

use crate::{domain::RoomState, room_actor::RoomCommand, service::GameServiceImpl};

fn validate_chat_body(body: &str) -> Result<String, &'static str> {
    let body = body.trim().to_string();
    if body.is_empty() {
        return Err("body is required");
    }
    if body.len() > 500 {
        return Err("body is too long");
    }
    Ok(body)
}

impl GameServiceImpl {
    pub(crate) async fn resolve_chat_author(
        &self,
        state: &RoomState,
        author: Option<proto::richcrab::v1::post_chat_message_request::Author>,
    ) -> Result<String, Status> {
        match author {
            Some(proto::richcrab::v1::post_chat_message_request::Author::PlayerId(player_id)) => {
                if state.players.contains_key(&player_id.value) {
                    Ok(player_id.value)
                } else {
                    Err(Status::permission_denied("player is not in room"))
                }
            }
            Some(proto::richcrab::v1::post_chat_message_request::Author::UserId(user_id)) => {
                if state.owner_user_id == user_id.value {
                    Ok(user_id.value)
                } else {
                    Err(Status::permission_denied(
                        "host is not allowed for this room",
                    ))
                }
            }
            None => Err(Status::invalid_argument("author is required")),
        }
    }
    pub(crate) async fn check_chat_rate_limit(
        &self,
        room_id: &str,
        author: &str,
    ) -> Result<(), Status> {
        let key = format!("{room_id}:{author}");
        let now = Instant::now();
        let mut lock = self.chat_rate_limit.write().await;
        if let Some(last_seen) = lock.get(&key) {
            if now.duration_since(*last_seen) < self.chat_min_interval {
                return Err(Status::resource_exhausted("too many chat messages"));
            }
        }
        lock.insert(key, now);
        Ok(())
    }

    pub(crate) async fn post_chat_message_uc(
        &self,
        request: Request<proto::richcrab::v1::PostChatMessageRequest>,
    ) -> Result<Response<proto::richcrab::v1::PostChatMessageResponse>, Status> {
        let req = request.into_inner();
        let room_id = req
            .room_id
            .map(|v| v.value)
            .ok_or_else(|| Status::invalid_argument("room_id is required"))?;
        let body = validate_chat_body(&req.body).map_err(Status::invalid_argument)?;
        let room = self.resolve_room(&room_id).await?;
        let (state_tx, state_rx) = oneshot::channel();
        room.tx
            .send(RoomCommand::GetState { response: state_tx })
            .await
            .map_err(|_| Status::unavailable("room is unavailable"))?;
        let state = state_rx
            .await
            .map_err(|_| Status::internal("room actor response dropped"))?;
        let author = self.resolve_chat_author(&state, req.author).await?;
        self.check_chat_rate_limit(&room_id, &author).await?;
        let message = self
            .chat_repository
            .create(&room_id, &author, &body)
            .await
            .map_err(|e| Status::internal(format!("failed to persist chat message: {e}")))?;
        let _ = room.events.send(proto::richcrab::v1::RoomEvent {
            payload: Some(proto::richcrab::v1::room_event::Payload::ChatMessagePosted(
                proto::richcrab::v1::ChatMessagePostedEvent {
                    room_id: Some(proto::richcrab::v1::RoomId { value: room_id }),
                    message_id: message.id.to_string(),
                    author: message.author.clone(),
                    body: message.body.clone(),
                    created_at: Some(prost_types::Timestamp {
                        seconds: message.created_at.timestamp(),
                        nanos: message.created_at.timestamp_subsec_nanos() as i32,
                    }),
                },
            )),
            emitted_at: Self::now_ts(),
        });
        Ok(Response::new(
            proto::richcrab::v1::PostChatMessageResponse {
                message: Some(super::read_models::map_chat_message(message)),
                error: None,
            },
        ))
    }

    pub(crate) async fn get_room_chat_messages_uc(
        &self,
        request: Request<proto::richcrab::v1::GetRoomChatMessagesRequest>,
    ) -> Result<Response<proto::richcrab::v1::GetRoomChatMessagesResponse>, Status> {
        let req = request.into_inner();
        let room_id = req
            .room_id
            .map(|v| v.value)
            .ok_or_else(|| Status::invalid_argument("room_id is required"))?;
        let limit = i64::from(req.limit.clamp(1, 100));
        let messages = self
            .chat_repository
            .list_recent(&room_id, limit)
            .await
            .map_err(|e| Status::internal(format!("failed to load chat messages: {e}")))?;
        Ok(Response::new(
            proto::richcrab::v1::GetRoomChatMessagesResponse {
                messages: messages
                    .into_iter()
                    .map(super::read_models::map_chat_message)
                    .collect(),
                error: None,
            },
        ))
    }
}

#[cfg(test)]
mod tests {
    use super::validate_chat_body;

    #[test]
    fn validate_chat_body_rejects_empty_message() {
        let result = validate_chat_body("   ");
        assert!(result.is_err());
        assert_eq!(result.expect_err("error expected"), "body is required");
    }

    #[test]
    fn validate_chat_body_rejects_too_long_message() {
        let oversized = "a".repeat(501);
        let result = validate_chat_body(&oversized);
        assert!(result.is_err());
        assert_eq!(result.expect_err("error expected"), "body is too long");
    }

    #[test]
    fn validate_chat_body_trims_valid_message() {
        let result = validate_chat_body("  hello  ").expect("valid body expected");
        assert_eq!(result, "hello");
    }
}
