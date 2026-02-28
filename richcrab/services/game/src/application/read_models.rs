use tokio::sync::oneshot;
use tonic::{Request, Response, Status};

use crate::{repository::RoomChatMessage, room_actor::RoomCommand, service::GameServiceImpl};

pub(crate) fn map_chat_message(message: RoomChatMessage) -> proto::richcrab::v1::ChatMessage {
    proto::richcrab::v1::ChatMessage {
        message_id: message.id.to_string(),
        room_id: Some(proto::richcrab::v1::RoomId {
            value: message.room_id,
        }),
        author: message.author,
        body: message.body,
        created_at: Some(prost_types::Timestamp {
            seconds: message.created_at.timestamp(),
            nanos: message.created_at.timestamp_subsec_nanos() as i32,
        }),
    }
}

impl GameServiceImpl {
    pub(crate) async fn room_snapshot(
        &self,
        room_id: &str,
        pin: &str,
    ) -> Result<proto::richcrab::v1::RoomSnapshot, Status> {
        let room = self.resolve_room(room_id).await?;
        let (tx, rx) = oneshot::channel();
        room.tx
            .send(RoomCommand::GetState { response: tx })
            .await
            .map_err(|_| Status::unavailable("room is unavailable"))?;
        let state = rx
            .await
            .map_err(|_| Status::internal("room actor response dropped"))?;
        let players: Vec<proto::richcrab::v1::PlayerState> = state
            .players
            .values()
            .map(|p| proto::richcrab::v1::PlayerState {
                player_id: Some(proto::richcrab::v1::PlayerId {
                    value: p.player_id.clone(),
                }),
                display_name: p.display_name.clone(),
                score: p.score,
                team_id: p.team_id.clone(),
            })
            .collect();
        let invite_token = self
            .redis
            .get_value(&shared::redis_keys::room_invite_token_key(room_id))
            .await
            .map_err(|e| Status::internal(format!("failed to load room invite token: {e}")))?;
        let invite_path = invite_token
            .map(|token| super::invite::invite_path(&token))
            .unwrap_or_default();
        Ok(proto::richcrab::v1::RoomSnapshot {
            room_id: Some(proto::richcrab::v1::RoomId {
                value: state.room_id,
            }),
            pin: pin.to_string(),
            owner_user_id: Some(proto::richcrab::v1::UserId {
                value: state.owner_user_id,
            }),
            quiz_id: Some(proto::richcrab::v1::QuizId {
                value: state.quiz_id,
            }),
            title: state.title,
            state: state.state.as_str().to_string(),
            players,
            updated_at: Some(prost_types::Timestamp {
                seconds: state.updated_at.timestamp(),
                nanos: state.updated_at.timestamp_subsec_nanos() as i32,
            }),
            invite_path,
            settings: Some(super::room_lifecycle::to_proto_settings(&state.settings)),
        })
    }

    pub(crate) async fn get_room_state_uc(
        &self,
        request: Request<proto::richcrab::v1::GetRoomStateRequest>,
    ) -> Result<Response<proto::richcrab::v1::GetRoomStateResponse>, Status> {
        let req = request.into_inner();
        let room_id = req
            .room_id
            .map(|v| v.value)
            .ok_or_else(|| Status::invalid_argument("room_id is required"))?;
        let room = self.resolve_room(&room_id).await?;
        let (tx, rx) = oneshot::channel();
        room.tx
            .send(RoomCommand::GetState { response: tx })
            .await
            .map_err(|_| Status::unavailable("room is unavailable"))?;
        let state = rx
            .await
            .map_err(|_| Status::internal("room actor response dropped"))?;
        let current_question_id = state
            .current_question
            .as_ref()
            .map(|q| q.question_id.clone());
        let current_question =
            state
                .current_question
                .clone()
                .map(|q| proto::richcrab::v1::QuestionState {
                    question_id: q.question_id,
                    question_text: q.question_text,
                    options: q.options,
                    ends_at: Some(prost_types::Timestamp {
                        seconds: q.ends_at.timestamp(),
                        nanos: q.ends_at.timestamp_subsec_nanos() as i32,
                    }),
                });
        let players: Vec<proto::richcrab::v1::PlayerState> = state
            .players
            .values()
            .map(|p| proto::richcrab::v1::PlayerState {
                player_id: Some(proto::richcrab::v1::PlayerId {
                    value: p.player_id.clone(),
                }),
                display_name: p.display_name.clone(),
                score: p.score,
                team_id: p.team_id.clone(),
            })
            .collect();
        let teams: Vec<proto::richcrab::v1::TeamState> = state
            .teams
            .values()
            .map(|team| proto::richcrab::v1::TeamState {
                team_id: team.team_id.clone(),
                score: team.score,
                players: state
                    .players
                    .values()
                    .filter(|player| player.team_id.as_deref() == Some(team.team_id.as_str()))
                    .map(|player| proto::richcrab::v1::PlayerId {
                        value: player.player_id.clone(),
                    })
                    .collect(),
            })
            .collect();
        let pin = self
            .room_pins
            .read()
            .await
            .get(&room_id)
            .cloned()
            .unwrap_or_default();
        let invite_token = self
            .redis
            .get_value(&shared::redis_keys::room_invite_token_key(&room_id))
            .await
            .map_err(|e| Status::internal(format!("failed to load room invite token: {e}")))?;
        let invite_path = invite_token
            .map(|token| super::invite::invite_path(&token))
            .unwrap_or_default();
        Ok(Response::new(proto::richcrab::v1::GetRoomStateResponse {
            room_id: Some(proto::richcrab::v1::RoomId {
                value: state.room_id.clone(),
            }),
            state: state.state.as_str().to_string(),
            players,
            current_question_id,
            updated_at: Self::now_ts(),
            error: None,
            teams,
            current_question,
            pin,
            quiz_id: Some(proto::richcrab::v1::QuizId {
                value: state.quiz_id,
            }),
            owner_user_id: Some(proto::richcrab::v1::UserId {
                value: state.owner_user_id,
            }),
            title: state.title,
            invite_path,
            settings: Some(super::room_lifecycle::to_proto_settings(&state.settings)),
        }))
    }

    pub(crate) async fn list_rooms_uc(
        &self,
        request: Request<proto::richcrab::v1::ListRoomsRequest>,
    ) -> Result<Response<proto::richcrab::v1::ListRoomsResponse>, Status> {
        let req = request.into_inner();
        let owner_user_id = req.owner_user_id.map(|v| v.value).unwrap_or_default();
        let limit = if req.limit == 0 {
            usize::MAX
        } else {
            req.limit as usize
        };
        let room_ids: Vec<String> = self.rooms.read().await.keys().cloned().collect();
        let room_pins = self.room_pins.read().await.clone();
        let mut rooms = Vec::new();
        for room_id in room_ids {
            let Some(pin) = room_pins.get(&room_id) else {
                continue;
            };
            let snapshot = self.room_snapshot(&room_id, pin).await?;
            let is_owner_room = snapshot
                .owner_user_id
                .as_ref()
                .map(|owner| owner.value.as_str())
                == Some(owner_user_id.as_str());
            let is_public_room = snapshot
                .settings
                .as_ref()
                .map(|s| {
                    proto::richcrab::v1::RoomVisibility::try_from(s.visibility)
                        .unwrap_or(proto::richcrab::v1::RoomVisibility::Private)
                        == proto::richcrab::v1::RoomVisibility::Public
                })
                .unwrap_or(false);
            if !(is_owner_room || (req.include_public && is_public_room)) {
                continue;
            }
            rooms.push(snapshot);
        }
        rooms.sort_by(|a, b| {
            let a_ts = a
                .updated_at
                .as_ref()
                .map(|ts| (ts.seconds, ts.nanos))
                .unwrap_or((0, 0));
            let b_ts = b
                .updated_at
                .as_ref()
                .map(|ts| (ts.seconds, ts.nanos))
                .unwrap_or((0, 0));
            b_ts.cmp(&a_ts)
        });
        rooms.truncate(limit);
        Ok(Response::new(proto::richcrab::v1::ListRoomsResponse {
            rooms,
            error: None,
        }))
    }
}
