use std::{
    collections::HashMap,
    pin::Pin,
    sync::Arc,
    time::{Duration, Instant},
};

use chrono::Utc;
use futures::Stream;
use qrcode::{render::svg, QrCode};
use rand::{distributions::Alphanumeric, Rng};
use serde::Deserialize;
use shared::{redis_client::RedisClient, redis_keys};
use tokio::sync::{broadcast, mpsc, oneshot, RwLock};
use tokio_stream::wrappers::ReceiverStream;
use tonic::{Request, Response, Status};
use tracing::info;

use crate::{
    domain::{GameQuestion, RoomLifecycleState, RoomState},
    repository::RoomChatRepository,
    room_actor::{spawn_room_actor, RoomCommand, RoomRegistry},
};

#[derive(Clone, Debug, Deserialize)]
struct JoinTicketPayload {
    room_id: String,
    display_name: String,
    issued_at_unix: i64,
}

fn invite_path(invite_token: &str) -> String {
    format!("/invite/{invite_token}")
}

fn invite_qr_svg(path: &str) -> Result<String, String> {
    let qr = QrCode::new(path).map_err(|e| format!("failed to generate invite QR code: {e}"))?;

    Ok(qr
        .render::<svg::Color>()
        .min_dimensions(246, 246)
        .quiet_zone(true)
        .build())
}

pub struct GameServiceImpl {
    redis: RedisClient,
    rooms: RoomRegistry,
    chat_repository: RoomChatRepository,
    chat_rate_limit: Arc<RwLock<HashMap<String, Instant>>>,
    entitlements: proto::richcrab::v1::entitlements_service_client::EntitlementsServiceClient<
        tonic::transport::Channel,
    >,
    quiz: proto::richcrab::v1::quiz_service_client::QuizServiceClient<tonic::transport::Channel>,
    pin_ttl: Duration,
    chat_min_interval: Duration,
}

impl GameServiceImpl {
    pub fn new(
        redis: RedisClient,
        entitlements: proto::richcrab::v1::entitlements_service_client::EntitlementsServiceClient<
            tonic::transport::Channel,
        >,
        quiz: proto::richcrab::v1::quiz_service_client::QuizServiceClient<
            tonic::transport::Channel,
        >,
        chat_repository: RoomChatRepository,
    ) -> Self {
        Self {
            redis,
            rooms: Arc::new(RwLock::new(HashMap::new())),
            entitlements,
            quiz,
            chat_repository,
            chat_rate_limit: Arc::new(RwLock::new(HashMap::new())),
            pin_ttl: Duration::from_secs(60 * 60 * 12),
            chat_min_interval: Duration::from_millis(750),
        }
    }

    async fn check_entitlement(&self, user_id: &str, feature: &str) -> Result<(), Status> {
        let mut client = self.entitlements.clone();
        let response = client
            .check_entitlement(proto::richcrab::v1::CheckEntitlementRequest {
                user_id: Some(proto::richcrab::v1::UserId {
                    value: user_id.to_string(),
                }),
                feature: feature.to_string(),
            })
            .await
            .map_err(|e| Status::unavailable(format!("entitlements unavailable: {e}")))?
            .into_inner();

        if response.allowed {
            Ok(())
        } else {
            Err(Status::permission_denied(response.reason))
        }
    }

    async fn report_usage(&self, user_id: &str, feature: &str, units: u64) -> Result<(), Status> {
        let mut client = self.entitlements.clone();
        client
            .report_usage(proto::richcrab::v1::ReportUsageRequest {
                user_id: Some(proto::richcrab::v1::UserId {
                    value: user_id.to_string(),
                }),
                feature: feature.to_string(),
                units,
            })
            .await
            .map_err(|e| Status::unavailable(format!("entitlements unavailable: {e}")))?;
        Ok(())
    }

    async fn resolve_room(&self, room_id: &str) -> Result<crate::room_actor::RoomHandle, Status> {
        self.rooms
            .read()
            .await
            .get(room_id)
            .cloned()
            .ok_or_else(|| Status::not_found("room not found"))
    }

    fn now_ts() -> Option<prost_types::Timestamp> {
        Some(prost_types::Timestamp::from(std::time::SystemTime::now()))
    }

    async fn load_quiz_questions(&self, quiz_id: &str) -> Result<Vec<GameQuestion>, Status> {
        let mut client = self.quiz.clone();
        let response = client
            .get_quiz(proto::richcrab::v1::GetQuizRequest {
                quiz_id: Some(proto::richcrab::v1::QuizId {
                    value: quiz_id.to_string(),
                }),
            })
            .await
            .map_err(|e| Status::unavailable(format!("quiz unavailable: {e}")))?
            .into_inner();

        let quiz = response
            .quiz
            .ok_or_else(|| Status::not_found("quiz not found"))?;

        if quiz.questions.is_empty() {
            return Err(Status::failed_precondition("quiz has no questions"));
        }

        let mut questions = Vec::with_capacity(quiz.questions.len());
        for q in quiz.questions {
            if q.options.len() < 2 {
                return Err(Status::failed_precondition(format!(
                    "quiz question {} has less than 2 options",
                    q.id
                )));
            }
            if let Some(correct_idx) = q.correct_option_index {
                if (correct_idx as usize) >= q.options.len() {
                    return Err(Status::failed_precondition(format!(
                        "quiz question {} has invalid correct option index",
                        q.id
                    )));
                }
            }
            questions.push(GameQuestion {
                question_id: q.id,
                question_text: q.text,
                options: q.options,
                correct_option_index: q.correct_option_index,
            });
        }

        Ok(questions)
    }

    async fn resolve_chat_author(
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

    async fn check_chat_rate_limit(&self, room_id: &str, author: &str) -> Result<(), Status> {
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

    fn map_chat_message(
        message: crate::repository::RoomChatMessage,
    ) -> proto::richcrab::v1::ChatMessage {
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
}

type EventStream =
    Pin<Box<dyn Stream<Item = Result<proto::richcrab::v1::RoomEvent, Status>> + Send>>;

#[tonic::async_trait]
impl proto::richcrab::v1::game_service_server::GameService for GameServiceImpl {
    async fn create_room(
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

        self.check_entitlement(&owner_id, "CREATE_ROOM").await?;

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

        let initial_state = RoomState {
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
        metrics.rooms_active.inc();
        self.report_usage(&owner_id, "CREATE_ROOM", 1).await?;

        let invite_path = invite_path(&invite_token);
        let invite_qr_svg = invite_qr_svg(&invite_path).map_err(Status::internal)?;

        Ok(Response::new(proto::richcrab::v1::CreateRoomResponse {
            room_id: Some(proto::richcrab::v1::RoomId { value: room_id }),
            pin,
            invite_token,
            created_at: Self::now_ts(),
            error: None,
            invite_path,
            invite_qr_svg,
        }))
    }

    async fn regenerate_invite(
        &self,
        request: Request<proto::richcrab::v1::RegenerateInviteRequest>,
    ) -> Result<Response<proto::richcrab::v1::RegenerateInviteResponse>, Status> {
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
        let (state_tx, state_rx) = oneshot::channel();
        room.tx
            .send(RoomCommand::GetState { response: state_tx })
            .await
            .map_err(|_| Status::unavailable("room is unavailable"))?;
        let state = state_rx
            .await
            .map_err(|_| Status::internal("room actor response dropped"))?;

        if requested_by != state.owner_user_id {
            return Err(Status::permission_denied(
                "only room owner can regenerate invite",
            ));
        }

        let previous_token = self
            .redis
            .get_value(&redis_keys::room_invite_token_key(&room_id))
            .await
            .map_err(|e| Status::internal(format!("failed to read room invite token: {e}")))?;

        let invite_token = uuid::Uuid::new_v4().to_string();
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

        if let Some(previous_token) = previous_token {
            if previous_token != invite_token {
                self.redis
                    .delete_key(&redis_keys::invite_key(previous_token))
                    .await
                    .map_err(|e| {
                        Status::internal(format!("failed to delete old invite token: {e}"))
                    })?;
            }
        }

        let invite_path = invite_path(&invite_token);
        let invite_qr_svg = invite_qr_svg(&invite_path).map_err(Status::internal)?;

        Ok(Response::new(
            proto::richcrab::v1::RegenerateInviteResponse {
                invite_token,
                invite_path,
                invite_qr_svg,
                error: None,
            },
        ))
    }

    async fn join_room(
        &self,
        request: Request<proto::richcrab::v1::JoinRoomRequest>,
    ) -> Result<Response<proto::richcrab::v1::JoinRoomResponse>, Status> {
        let metrics = shared::observability::init_metrics();
        let req = request.into_inner();
        let ticket = req.join_ticket;
        if ticket.is_empty() {
            return Err(Status::invalid_argument("join_ticket is required"));
        }

        let payload_raw = self
            .redis
            .consume_join_ticket(&redis_keys::ticket_key(&ticket))
            .await
            .map_err(|e| Status::internal(format!("failed to consume ticket: {e}")))?
            .ok_or_else(|| Status::permission_denied("join ticket is invalid or expired"))?;
        let payload: JoinTicketPayload = serde_json::from_str(&payload_raw).map_err(|_| {
            shared::observability::error("game", "join_ticket_payload_invalid");
            Status::permission_denied("join ticket payload is invalid")
        })?;
        info!(request_id = %uuid::Uuid::new_v4(), room_id = %payload.room_id, user_id = "", bot_id = "", "join_room");
        let issued_at = chrono::DateTime::from_timestamp(payload.issued_at_unix, 0)
            .ok_or_else(|| Status::permission_denied("join ticket issued_at is invalid"))?;
        let max_ticket_age = chrono::Duration::from_std(redis_keys::TICKET_TTL)
            .map_err(|_| Status::internal("ticket ttl misconfigured"))?;
        if (Utc::now() - issued_at) > max_ticket_age {
            return Err(Status::permission_denied("join ticket is expired"));
        }

        let room = self.resolve_room(&payload.room_id).await?;
        let (state_tx, state_rx) = oneshot::channel();
        room.tx
            .send(RoomCommand::GetState { response: state_tx })
            .await
            .map_err(|_| Status::unavailable("room is unavailable"))?;
        let state = state_rx
            .await
            .map_err(|_| Status::internal("room actor response dropped"))?;
        self.check_entitlement(&state.owner_user_id, "MAX_PLAYERS_IN_ROOM")
            .await?;

        let (tx, rx) = oneshot::channel();
        room.tx
            .send(RoomCommand::Join {
                user_id: String::new(),
                display_name: payload.display_name,
                response: tx,
            })
            .await
            .map_err(|_| Status::unavailable("room is unavailable"))?;
        let player_id = rx
            .await
            .map_err(|_| Status::internal("room actor response dropped"))?
            .map_err(Status::failed_precondition)?;
        self.report_usage(&state.owner_user_id, "MAX_PLAYERS_IN_ROOM", 1)
            .await?;
        metrics.players_connected.inc();

        Ok(Response::new(proto::richcrab::v1::JoinRoomResponse {
            player_id: Some(proto::richcrab::v1::PlayerId { value: player_id }),
            joined_at: Self::now_ts(),
            error: None,
        }))
    }

    async fn start_game(
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

        self.check_entitlement(&requested_by, "START_GAME").await?;

        let room = self.resolve_room(&room_id).await?;
        let (state_tx, state_rx) = oneshot::channel();
        room.tx
            .send(RoomCommand::GetState { response: state_tx })
            .await
            .map_err(|_| Status::unavailable("room is unavailable"))?;
        let state = state_rx
            .await
            .map_err(|_| Status::internal("room actor response dropped"))?;
        let questions = self.load_quiz_questions(&state.quiz_id).await?;

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
        self.report_usage(&requested_by, "START_GAME", 1).await?;

        Ok(Response::new(proto::richcrab::v1::StartGameResponse {
            started: true,
            started_at: Self::now_ts(),
            error: None,
        }))
    }

    async fn leave_room(
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

    async fn kick_player(
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

    async fn pause_game(
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

    async fn resume_game(
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

    async fn next_question(
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

    async fn submit_answer(
        &self,
        request: Request<proto::richcrab::v1::SubmitAnswerRequest>,
    ) -> Result<Response<proto::richcrab::v1::SubmitAnswerResponse>, Status> {
        let req = request.into_inner();
        info!(request_id = %uuid::Uuid::new_v4(), room_id = req.room_id.as_ref().map(|v| v.value.as_str()).unwrap_or(""), user_id = "", bot_id = "", "submit_answer");
        let room_id = req
            .room_id
            .map(|v| v.value)
            .ok_or_else(|| Status::invalid_argument("room_id is required"))?;
        let player_id = req
            .player_id
            .map(|v| v.value)
            .ok_or_else(|| Status::invalid_argument("player_id is required"))?;

        let room = self.resolve_room(&room_id).await?;

        let (state_tx, state_rx) = oneshot::channel();
        room.tx
            .send(RoomCommand::GetState { response: state_tx })
            .await
            .map_err(|_| Status::unavailable("room is unavailable"))?;
        let state = state_rx
            .await
            .map_err(|_| Status::internal("room actor response dropped"))?;
        if !state.players.contains_key(&player_id) {
            return Err(Status::not_found("player not found"));
        }

        let (tx, rx) = oneshot::channel();
        room.tx
            .send(RoomCommand::SubmitAnswer {
                player_id,
                question_id: req.question_id,
                answer: req.answer,
                response: tx,
            })
            .await
            .map_err(|_| Status::unavailable("room is unavailable"))?;
        let delta = rx
            .await
            .map_err(|_| Status::internal("room actor response dropped"))?
            .map_err(Status::failed_precondition)?;

        Ok(Response::new(proto::richcrab::v1::SubmitAnswerResponse {
            accepted: true,
            score_delta: delta,
            error: None,
        }))
    }

    async fn post_chat_message(
        &self,
        request: Request<proto::richcrab::v1::PostChatMessageRequest>,
    ) -> Result<Response<proto::richcrab::v1::PostChatMessageResponse>, Status> {
        let req = request.into_inner();
        let room_id = req
            .room_id
            .map(|v| v.value)
            .ok_or_else(|| Status::invalid_argument("room_id is required"))?;
        let body = req.body.trim().to_string();
        if body.is_empty() {
            return Err(Status::invalid_argument("body is required"));
        }
        if body.len() > 500 {
            return Err(Status::invalid_argument("body is too long"));
        }

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
                message: Some(Self::map_chat_message(message)),
                error: None,
            },
        ))
    }

    async fn get_room_chat_messages(
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
                messages: messages.into_iter().map(Self::map_chat_message).collect(),
                error: None,
            },
        ))
    }

    type SubscribeRoomEventsStream = EventStream;

    async fn subscribe_room_events(
        &self,
        request: Request<proto::richcrab::v1::SubscribeRoomEventsRequest>,
    ) -> Result<Response<Self::SubscribeRoomEventsStream>, Status> {
        let req = request.into_inner();
        let room_id = req
            .room_id
            .map(|v| v.value)
            .ok_or_else(|| Status::invalid_argument("room_id is required"))?;
        let room = self.resolve_room(&room_id).await?;
        let mut receiver = room.events.subscribe();

        let (tx, rx) = mpsc::channel(32);
        tokio::spawn(async move {
            loop {
                match receiver.recv().await {
                    Ok(event) => {
                        if tx.send(Ok(event)).await.is_err() {
                            break;
                        }
                    }
                    Err(broadcast::error::RecvError::Lagged(skipped)) => {
                        let _ = tx
                            .send(Ok(proto::richcrab::v1::RoomEvent {
                                payload: Some(proto::richcrab::v1::room_event::Payload::Error(
                                    proto::richcrab::v1::ErrorEvent {
                                        room_id: Some(proto::richcrab::v1::RoomId {
                                            value: room_id.clone(),
                                        }),
                                        error: Some(proto::richcrab::v1::Error {
                                            code: "EVENT_BACKPRESSURE".to_string(),
                                            message: format!(
                                                "consumer lagged behind by {skipped} events"
                                            ),
                                            details: Vec::new(),
                                            occurred_at: Self::now_ts(),
                                            retry_after: None,
                                        }),
                                    },
                                )),
                                emitted_at: Self::now_ts(),
                            }))
                            .await;
                    }
                    Err(broadcast::error::RecvError::Closed) => break,
                }
            }
        });

        Ok(Response::new(
            Box::pin(ReceiverStream::new(rx)) as Self::SubscribeRoomEventsStream
        ))
    }

    async fn get_room_state(
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

        Ok(Response::new(proto::richcrab::v1::GetRoomStateResponse {
            room_id: Some(proto::richcrab::v1::RoomId {
                value: state.room_id,
            }),
            state: state.state.as_str().to_string(),
            players,
            current_question_id,
            updated_at: Self::now_ts(),
            error: None,
            teams,
            current_question,
        }))
    }
}

#[derive(Default)]
pub struct HealthServiceImpl;

#[tonic::async_trait]
impl proto::richcrab::v1::health_server::Health for HealthServiceImpl {
    async fn ping(
        &self,
        _request: Request<proto::richcrab::v1::PingRequest>,
    ) -> Result<Response<proto::richcrab::v1::PingResponse>, Status> {
        Ok(Response::new(proto::richcrab::v1::PingResponse {
            message: "pong".to_string(),
        }))
    }
}

#[cfg(test)]
mod tests {
    use super::{invite_path, invite_qr_svg};

    #[test]
    fn invite_path_is_relative() {
        let token = "abc123";
        let path = invite_path(token);

        assert!(path.starts_with('/'));
        assert_eq!(path, "/invite/abc123");
        assert!(!path.contains("://"));
    }

    #[test]
    fn invite_qr_svg_is_valid_svg() {
        let svg = invite_qr_svg("/invite/abc123").expect("qr svg is generated");

        assert!(svg.contains("<svg"));
        assert!(svg.contains("</svg>"));
        assert!(svg.contains("<rect"));
    }
}
