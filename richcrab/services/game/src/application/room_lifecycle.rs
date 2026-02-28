use std::collections::HashMap;

use chrono::Utc;
use rand::{distributions::Alphanumeric, Rng};
use shared::redis_keys;
use tokio::sync::oneshot;
use tonic::{Request, Response, Status};
use tracing::info;

use crate::{
    domain::{RoomLifecycleState, RoomSettings, RoomState, RoomTimers, RoomVisibility},
    room_actor::{spawn_room_actor, RoomCommand},
    service::GameServiceImpl,
};

pub(crate) fn from_proto_settings(
    settings: Option<proto::richcrab::v1::RoomSettings>,
) -> RoomSettings {
    let s = settings.unwrap_or_default();
    let timers = s.timers.unwrap_or_default();
    let visibility = match proto::richcrab::v1::RoomVisibility::try_from(s.visibility)
        .unwrap_or(proto::richcrab::v1::RoomVisibility::Private)
    {
        proto::richcrab::v1::RoomVisibility::Public => RoomVisibility::Public,
        _ => RoomVisibility::Private,
    };

    RoomSettings {
        player_limit: if s.player_limit == 0 {
            20
        } else {
            s.player_limit
        },
        visibility,
        timers: RoomTimers {
            lobby_timer_sec: if timers.lobby_timer_sec == 0 {
                45
            } else {
                timers.lobby_timer_sec
            },
            question_timer_sec: if timers.question_timer_sec == 0 {
                30
            } else {
                timers.question_timer_sec
            },
            answer_reveal_sec: if timers.answer_reveal_sec == 0 {
                10
            } else {
                timers.answer_reveal_sec
            },
        },
    }
}

pub(crate) fn to_proto_settings(settings: &RoomSettings) -> proto::richcrab::v1::RoomSettings {
    proto::richcrab::v1::RoomSettings {
        player_limit: settings.player_limit,
        visibility: match settings.visibility {
            RoomVisibility::Public => proto::richcrab::v1::RoomVisibility::Public as i32,
            RoomVisibility::Private => proto::richcrab::v1::RoomVisibility::Private as i32,
        },
        timers: Some(proto::richcrab::v1::RoomTimers {
            lobby_timer_sec: settings.timers.lobby_timer_sec,
            question_timer_sec: settings.timers.question_timer_sec,
            answer_reveal_sec: settings.timers.answer_reveal_sec,
        }),
    }
}

impl GameServiceImpl {
    pub(crate) async fn create_room_uc(
        &self,
        request: Request<proto::richcrab::v1::CreateRoomRequest>,
    ) -> Result<Response<proto::richcrab::v1::CreateRoomResponse>, Status> {
        let metrics = shared::observability::init_metrics();
        let req = request.into_inner();
        let owner_id = req
            .owner_user_id
            .and_then(|u| (!u.value.is_empty()).then_some(u.value))
            .ok_or_else(|| Status::invalid_argument("owner_user_id is required"))?;
        let quiz_id = req
            .quiz_id
            .and_then(|q| (!q.value.is_empty()).then_some(q.value))
            .ok_or_else(|| Status::invalid_argument("quiz_id is required"))?;
        self.entitlements
            .check_entitlement(&owner_id, "CREATE_ROOM")
            .await?;

        let room_id = uuid::Uuid::new_v4().to_string();
        info!(request_id = %uuid::Uuid::new_v4(), room_id = %room_id, user_id = %owner_id, bot_id = "", "create_room");
        let invite_token = uuid::Uuid::new_v4().to_string();
        let pin = loop {
            let candidate: String = rand::thread_rng()
                .sample_iter(Alphanumeric)
                .take(6)
                .map(char::from)
                .collect::<String>()
                .to_uppercase();
            let key = redis_keys::pin_key(&candidate);
            if self
                .redis
                .set_unique_pin(&key, &room_id, self.pin_ttl)
                .await
                .map_err(|e| Status::internal(format!("failed to reserve pin: {e}")))?
            {
                break candidate;
            }
        };
        self.redis
            .set_with_ttl(
                &redis_keys::invite_key(&invite_token),
                &room_id,
                self.pin_ttl,
            )
            .await
            .map_err(|e| Status::internal(format!("failed to write invite token: {e}")))?;
        self.redis
            .set_with_ttl(
                &redis_keys::room_invite_token_key(&room_id),
                &invite_token,
                self.pin_ttl,
            )
            .await
            .map_err(|e| Status::internal(format!("failed to write room invite token: {e}")))?;
        let room_settings = from_proto_settings(req.settings);
        let initial_state = RoomState {
            settings: room_settings.clone(),
            room_id: room_id.clone(),
            owner_user_id: owner_id.clone(),
            quiz_id,
            title: req.title,
            state: RoomLifecycleState::Lobby,
            players: HashMap::new(),
            teams: HashMap::new(),
            question_bank: Vec::new(),
            current_question: None,
            timer: None,
            result: None,
            updated_at: Utc::now(),
        };
        let (handle, _task) = spawn_room_actor(initial_state, 64);
        self.rooms.write().await.insert(room_id.clone(), handle);
        self.room_pins
            .write()
            .await
            .insert(room_id.clone(), pin.clone());
        metrics.rooms_active.inc();
        self.entitlements
            .report_usage(&owner_id, "CREATE_ROOM", 1)
            .await?;
        let invite_path = super::invite::invite_path(&invite_token);
        let invite_qr_svg = super::invite::invite_qr_svg(&invite_path).map_err(Status::internal)?;

        Ok(Response::new(proto::richcrab::v1::CreateRoomResponse {
            room_id: Some(proto::richcrab::v1::RoomId { value: room_id }),
            pin,
            invite_token,
            created_at: Self::now_ts(),
            error: None,
            invite_path,
            invite_qr_svg,
            settings: Some(to_proto_settings(&room_settings)),
        }))
    }

    pub(crate) async fn start_game_uc(
        &self,
        request: Request<proto::richcrab::v1::StartGameRequest>,
    ) -> Result<Response<proto::richcrab::v1::StartGameResponse>, Status> {
        let req = request.into_inner();
        let room_id = req
            .room_id
            .map(|v| v.value)
            .ok_or_else(|| Status::invalid_argument("room_id is required"))?;
        let requested_by = req
            .requested_by
            .map(|v| v.value)
            .ok_or_else(|| Status::invalid_argument("requested_by is required"))?;
        self.entitlements
            .check_entitlement(&requested_by, "START_GAME")
            .await?;
        let room = self.resolve_room(&room_id).await?;
        let (state_tx, state_rx) = oneshot::channel();
        room.tx
            .send(RoomCommand::GetState { response: state_tx })
            .await
            .map_err(|_| Status::unavailable("room is unavailable"))?;
        let state = state_rx
            .await
            .map_err(|_| Status::internal("room actor response dropped"))?;
        let questions = self.quiz.load_quiz_questions(&state.quiz_id).await?;
        let (tx, rx) = oneshot::channel();
        room.tx
            .send(RoomCommand::StartGame {
                requested_by: requested_by.clone(),
                questions,
                response: tx,
            })
            .await
            .map_err(|_| Status::unavailable("room is unavailable"))?;
        rx.await
            .map_err(|_| Status::internal("room actor response dropped"))?
            .map_err(Status::failed_precondition)?;
        self.entitlements
            .report_usage(&requested_by, "START_GAME", 1)
            .await?;
        Ok(Response::new(proto::richcrab::v1::StartGameResponse {
            started: true,
            started_at: Self::now_ts(),
            error: None,
        }))
    }
    pub(crate) async fn leave_room_uc(
        &self,
        request: Request<proto::richcrab::v1::LeaveRoomRequest>,
    ) -> Result<Response<proto::richcrab::v1::LeaveRoomResponse>, Status> {
        let req = request.into_inner();
        let room_id = req
            .room_id
            .map(|v| v.value)
            .ok_or_else(|| Status::invalid_argument("room_id is required"))?;
        let player_id = req
            .player_id
            .map(|v| v.value)
            .ok_or_else(|| Status::invalid_argument("player_id is required"))?;
        let room = self.resolve_room(&room_id).await?;
        let (tx, rx) = oneshot::channel();
        room.tx
            .send(RoomCommand::Leave {
                player_id,
                response: tx,
            })
            .await
            .map_err(|_| Status::unavailable("room is unavailable"))?;
        rx.await
            .map_err(|_| Status::internal("room actor response dropped"))?
            .map_err(Status::failed_precondition)?;
        Ok(Response::new(proto::richcrab::v1::LeaveRoomResponse {
            left: true,
            error: None,
        }))
    }
    pub(crate) async fn kick_player_uc(
        &self,
        request: Request<proto::richcrab::v1::KickPlayerRequest>,
    ) -> Result<Response<proto::richcrab::v1::KickPlayerResponse>, Status> {
        let req = request.into_inner();
        let room_id = req
            .room_id
            .map(|v| v.value)
            .ok_or_else(|| Status::invalid_argument("room_id is required"))?;
        let requested_by = req
            .requested_by
            .map(|v| v.value)
            .ok_or_else(|| Status::invalid_argument("requested_by is required"))?;
        let player_id = req
            .player_id
            .map(|v| v.value)
            .ok_or_else(|| Status::invalid_argument("player_id is required"))?;
        let room = self.resolve_room(&room_id).await?;
        let (tx, rx) = oneshot::channel();
        room.tx
            .send(RoomCommand::KickPlayer {
                requested_by,
                player_id,
                response: tx,
            })
            .await
            .map_err(|_| Status::unavailable("room is unavailable"))?;
        rx.await
            .map_err(|_| Status::internal("room actor response dropped"))?
            .map_err(Status::failed_precondition)?;
        Ok(Response::new(proto::richcrab::v1::KickPlayerResponse {
            kicked: true,
            error: None,
        }))
    }
    pub(crate) async fn pause_game_uc(
        &self,
        request: Request<proto::richcrab::v1::PauseGameRequest>,
    ) -> Result<Response<proto::richcrab::v1::PauseGameResponse>, Status> {
        let req = request.into_inner();
        let room_id = req
            .room_id
            .map(|v| v.value)
            .ok_or_else(|| Status::invalid_argument("room_id is required"))?;
        let requested_by = req
            .requested_by
            .map(|v| v.value)
            .ok_or_else(|| Status::invalid_argument("requested_by is required"))?;
        let room = self.resolve_room(&room_id).await?;
        let (tx, rx) = oneshot::channel();
        room.tx
            .send(RoomCommand::PauseGame {
                requested_by,
                response: tx,
            })
            .await
            .map_err(|_| Status::unavailable("room is unavailable"))?;
        rx.await
            .map_err(|_| Status::internal("room actor response dropped"))?
            .map_err(Status::failed_precondition)?;
        Ok(Response::new(proto::richcrab::v1::PauseGameResponse {
            paused: true,
            error: None,
        }))
    }
    pub(crate) async fn resume_game_uc(
        &self,
        request: Request<proto::richcrab::v1::ResumeGameRequest>,
    ) -> Result<Response<proto::richcrab::v1::ResumeGameResponse>, Status> {
        let req = request.into_inner();
        let room_id = req
            .room_id
            .map(|v| v.value)
            .ok_or_else(|| Status::invalid_argument("room_id is required"))?;
        let requested_by = req
            .requested_by
            .map(|v| v.value)
            .ok_or_else(|| Status::invalid_argument("requested_by is required"))?;
        let room = self.resolve_room(&room_id).await?;
        let (tx, rx) = oneshot::channel();
        room.tx
            .send(RoomCommand::ResumeGame {
                requested_by,
                response: tx,
            })
            .await
            .map_err(|_| Status::unavailable("room is unavailable"))?;
        rx.await
            .map_err(|_| Status::internal("room actor response dropped"))?
            .map_err(Status::failed_precondition)?;
        Ok(Response::new(proto::richcrab::v1::ResumeGameResponse {
            resumed: true,
            error: None,
        }))
    }
    pub(crate) async fn next_question_uc(
        &self,
        request: Request<proto::richcrab::v1::NextQuestionRequest>,
    ) -> Result<Response<proto::richcrab::v1::NextQuestionResponse>, Status> {
        let req = request.into_inner();
        let room_id = req
            .room_id
            .map(|v| v.value)
            .ok_or_else(|| Status::invalid_argument("room_id is required"))?;
        let requested_by = req
            .requested_by
            .map(|v| v.value)
            .ok_or_else(|| Status::invalid_argument("requested_by is required"))?;
        let room = self.resolve_room(&room_id).await?;
        let (tx, rx) = oneshot::channel();
        room.tx
            .send(RoomCommand::NextQuestion {
                requested_by,
                response: tx,
            })
            .await
            .map_err(|_| Status::unavailable("room is unavailable"))?;
        rx.await
            .map_err(|_| Status::internal("room actor response dropped"))?
            .map_err(Status::failed_precondition)?;
        Ok(Response::new(proto::richcrab::v1::NextQuestionResponse {
            advanced: true,
            error: None,
        }))
    }
}

#[cfg(test)]
mod tests {
    use super::{from_proto_settings, to_proto_settings};
    #[test]
    fn default_settings_are_applied() {
        let settings = from_proto_settings(None);
        assert_eq!(settings.player_limit, 20);
        assert_eq!(settings.timers.question_timer_sec, 30);
    }

    #[test]
    fn settings_roundtrip_visibility() {
        let proto = proto::richcrab::v1::RoomSettings {
            player_limit: 10,
            visibility: proto::richcrab::v1::RoomVisibility::Public as i32,
            timers: Some(proto::richcrab::v1::RoomTimers::default()),
        };
        let domain = from_proto_settings(Some(proto));
        let back = to_proto_settings(&domain);
        assert_eq!(
            back.visibility,
            proto::richcrab::v1::RoomVisibility::Public as i32
        );
    }
}
