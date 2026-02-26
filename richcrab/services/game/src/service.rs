use std::{collections::HashMap, pin::Pin, sync::Arc, time::Duration};

use chrono::Utc;
use futures::Stream;
use rand::{distributions::Alphanumeric, Rng};
use serde::Deserialize;
use shared::{redis_client::RedisClient, redis_keys};
use tokio::sync::{broadcast, mpsc, oneshot, RwLock};
use tokio_stream::wrappers::ReceiverStream;
use tonic::{Request, Response, Status};
use tracing::info;

use crate::{
    domain::{RoomLifecycleState, RoomState},
    room_actor::{spawn_room_actor, RoomCommand, RoomRegistry},
};

#[derive(Clone, Debug, Deserialize)]
struct JoinTicketPayload {
    room_id: String,
    display_name: String,
    issued_at_unix: i64,
}

pub struct GameServiceImpl {
    redis: RedisClient,
    rooms: RoomRegistry,
    entitlements: proto::richcrab::v1::entitlements_service_client::EntitlementsServiceClient<
        tonic::transport::Channel,
    >,
    pin_ttl: Duration,
}

impl GameServiceImpl {
    pub fn new(
        redis: RedisClient,
        entitlements: proto::richcrab::v1::entitlements_service_client::EntitlementsServiceClient<
            tonic::transport::Channel,
        >,
    ) -> Self {
        Self {
            redis,
            rooms: Arc::new(RwLock::new(HashMap::new())),
            entitlements,
            pin_ttl: Duration::from_secs(60 * 60 * 12),
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

        let initial_state = RoomState {
            room_id: room_id.clone(),
            owner_user_id: owner_id.clone(),
            quiz_id,
            title: req.title,
            state: RoomLifecycleState::Lobby,
            players: HashMap::new(),
            teams: HashMap::new(),
            current_question: None,
            timer: None,
            result: None,
            updated_at: Utc::now(),
        };

        let (handle, _task) = spawn_room_actor(initial_state, 64);
        self.rooms.write().await.insert(room_id.clone(), handle);
        metrics.rooms_active.inc();
        self.report_usage(&owner_id, "CREATE_ROOM", 1).await?;

        Ok(Response::new(proto::richcrab::v1::CreateRoomResponse {
            room_id: Some(proto::richcrab::v1::RoomId { value: room_id }),
            pin,
            invite_token,
            created_at: Self::now_ts(),
            error: None,
        }))
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
        let (tx, rx) = oneshot::channel();
        room.tx
            .send(RoomCommand::StartGame {
                requested_by: requested_by.clone(),
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
                    ends_at: state.timer.as_ref().map(|timer| {
                        let deadline = q.started_at
                            + chrono::Duration::seconds(i64::from(timer.duration_secs));
                        prost_types::Timestamp {
                            seconds: deadline.timestamp(),
                            nanos: deadline.timestamp_subsec_nanos() as i32,
                        }
                    }),
                });

        Ok(Response::new(proto::richcrab::v1::GetRoomStateResponse {
            room_id: Some(proto::richcrab::v1::RoomId {
                value: state.room_id,
            }),
            state: state.state.as_str().to_string(),
            players: state
                .players
                .into_values()
                .map(|p| proto::richcrab::v1::PlayerState {
                    player_id: Some(proto::richcrab::v1::PlayerId { value: p.player_id }),
                    display_name: p.display_name,
                    score: p.score,
                    team_id: p.team_id,
                })
                .collect(),
            current_question_id,
            updated_at: Self::now_ts(),
            error: None,
            teams: state
                .teams
                .into_values()
                .map(|team| proto::richcrab::v1::TeamState {
                    team_id: team.team_id,
                    score: team.score,
                    players: Vec::new(),
                })
                .collect(),
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
