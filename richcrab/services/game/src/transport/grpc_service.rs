use std::pin::Pin;

use futures::Stream;
use tokio::sync::{broadcast, mpsc, oneshot};
use tokio_stream::wrappers::ReceiverStream;
use tonic::{Request, Response, Status};

use crate::{room_actor::RoomCommand, service::GameServiceImpl};

type EventStream =
    Pin<Box<dyn Stream<Item = Result<proto::richcrab::v1::RoomEvent, Status>> + Send>>;

#[tonic::async_trait]
impl proto::richcrab::v1::game_service_server::GameService for GameServiceImpl {
    async fn create_room(
        &self,
        request: Request<proto::richcrab::v1::CreateRoomRequest>,
    ) -> Result<Response<proto::richcrab::v1::CreateRoomResponse>, Status> {
        self.create_room_uc(request).await
    }
    async fn regenerate_invite(
        &self,
        request: Request<proto::richcrab::v1::RegenerateInviteRequest>,
    ) -> Result<Response<proto::richcrab::v1::RegenerateInviteResponse>, Status> {
        self.regenerate_invite_uc(request).await
    }
    async fn join_room(
        &self,
        request: Request<proto::richcrab::v1::JoinRoomRequest>,
    ) -> Result<Response<proto::richcrab::v1::JoinRoomResponse>, Status> {
        self.join_room_uc(request).await
    }
    async fn start_game(
        &self,
        request: Request<proto::richcrab::v1::StartGameRequest>,
    ) -> Result<Response<proto::richcrab::v1::StartGameResponse>, Status> {
        self.start_game_uc(request).await
    }
    async fn leave_room(
        &self,
        request: Request<proto::richcrab::v1::LeaveRoomRequest>,
    ) -> Result<Response<proto::richcrab::v1::LeaveRoomResponse>, Status> {
        self.leave_room_uc(request).await
    }
    async fn kick_player(
        &self,
        request: Request<proto::richcrab::v1::KickPlayerRequest>,
    ) -> Result<Response<proto::richcrab::v1::KickPlayerResponse>, Status> {
        self.kick_player_uc(request).await
    }
    async fn pause_game(
        &self,
        request: Request<proto::richcrab::v1::PauseGameRequest>,
    ) -> Result<Response<proto::richcrab::v1::PauseGameResponse>, Status> {
        self.pause_game_uc(request).await
    }
    async fn resume_game(
        &self,
        request: Request<proto::richcrab::v1::ResumeGameRequest>,
    ) -> Result<Response<proto::richcrab::v1::ResumeGameResponse>, Status> {
        self.resume_game_uc(request).await
    }
    async fn next_question(
        &self,
        request: Request<proto::richcrab::v1::NextQuestionRequest>,
    ) -> Result<Response<proto::richcrab::v1::NextQuestionResponse>, Status> {
        self.next_question_uc(request).await
    }

    async fn submit_answer(
        &self,
        request: Request<proto::richcrab::v1::SubmitAnswerRequest>,
    ) -> Result<Response<proto::richcrab::v1::SubmitAnswerResponse>, Status> {
        let req = request.into_inner();
        let room_id = req
            .room_id
            .map(|v| v.value)
            .ok_or_else(|| Status::invalid_argument("room_id is required"))?;
        let player_id = req
            .player_id
            .map(|v| v.value)
            .ok_or_else(|| Status::invalid_argument("player_id is required"))?;
        if req.question_id.is_empty() {
            return Err(Status::invalid_argument("question_id is required"));
        }
        if req.answer.is_empty() {
            return Err(Status::invalid_argument("answer is required"));
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
        self.post_chat_message_uc(request).await
    }
    async fn get_room_chat_messages(
        &self,
        request: Request<proto::richcrab::v1::GetRoomChatMessagesRequest>,
    ) -> Result<Response<proto::richcrab::v1::GetRoomChatMessagesResponse>, Status> {
        self.get_room_chat_messages_uc(request).await
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
                                            occurred_at: GameServiceImpl::now_ts(),
                                            retry_after: None,
                                        }),
                                    },
                                )),
                                emitted_at: GameServiceImpl::now_ts(),
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
        self.get_room_state_uc(request).await
    }
    async fn list_rooms(
        &self,
        request: Request<proto::richcrab::v1::ListRoomsRequest>,
    ) -> Result<Response<proto::richcrab::v1::ListRoomsResponse>, Status> {
        self.list_rooms_uc(request).await
    }
}
