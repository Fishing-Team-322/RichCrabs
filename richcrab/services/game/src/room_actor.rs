use std::{collections::HashMap, sync::Arc};

use chrono::Utc;
use tokio::sync::{broadcast, mpsc, oneshot, RwLock};

use crate::domain::{GameResult, Player, QuestionRound, RoomLifecycleState, RoomState, RoundTimer};

#[derive(Debug)]
pub enum RoomCommand {
    Join {
        user_id: String,
        display_name: String,
        response: oneshot::Sender<Result<String, String>>,
    },
    StartGame {
        requested_by: String,
        response: oneshot::Sender<Result<(), String>>,
    },
    SubmitAnswer {
        player_id: String,
        question_id: String,
        answer: String,
        response: oneshot::Sender<Result<u32, String>>,
    },
    GetState {
        response: oneshot::Sender<RoomState>,
    },
}

#[derive(Debug, Clone)]
pub struct RoomHandle {
    pub tx: mpsc::Sender<RoomCommand>,
    pub events: broadcast::Sender<proto::richcrab::v1::RoomEvent>,
}

pub type RoomRegistry = Arc<RwLock<HashMap<String, RoomHandle>>>;

pub fn spawn_room_actor(
    state: RoomState,
    event_buffer: usize,
) -> (RoomHandle, tokio::task::JoinHandle<()>) {
    let (tx, mut rx) = mpsc::channel::<RoomCommand>(128);
    let (events, _drop) = broadcast::channel(event_buffer);
    let events_tx = events.clone();

    let handle = RoomHandle { tx, events };

    let task = tokio::spawn(async move {
        let mut state = state;

        while let Some(command) = rx.recv().await {
            match command {
                RoomCommand::Join {
                    user_id,
                    display_name,
                    response,
                } => {
                    let player_id = uuid::Uuid::new_v4().to_string();
                    let player = Player {
                        player_id: player_id.clone(),
                        user_id,
                        display_name: display_name.clone(),
                        score: 0,
                    };
                    state.players.insert(player_id.clone(), player);
                    state.updated_at = Utc::now();

                    let _ = events_tx.send(proto::richcrab::v1::RoomEvent {
                        payload: Some(proto::richcrab::v1::room_event::Payload::PlayerJoined(
                            proto::richcrab::v1::PlayerJoinedEvent {
                                room_id: Some(proto::richcrab::v1::RoomId {
                                    value: state.room_id.clone(),
                                }),
                                player_id: Some(proto::richcrab::v1::PlayerId {
                                    value: player_id.clone(),
                                }),
                                display_name,
                            },
                        )),
                        emitted_at: Some(
                            prost_types::Timestamp::from(std::time::SystemTime::now()),
                        ),
                    });

                    let _ = response.send(Ok(player_id));
                }
                RoomCommand::StartGame {
                    requested_by,
                    response,
                } => {
                    if requested_by != state.owner_user_id {
                        let _ = response.send(Err("only owner can start game".to_string()));
                        continue;
                    }
                    state.state = RoomLifecycleState::InProgress;
                    state.current_question = Some(QuestionRound {
                        question_id: "q1".to_string(),
                        started_at: Utc::now(),
                        answers_locked: Default::default(),
                    });
                    state.timer = Some(RoundTimer {
                        started_at: Utc::now(),
                        duration_secs: 30,
                    });
                    state.updated_at = Utc::now();

                    let _ = events_tx.send(proto::richcrab::v1::RoomEvent {
                        payload: Some(proto::richcrab::v1::room_event::Payload::GameStarted(
                            proto::richcrab::v1::GameStartedEvent {
                                room_id: Some(proto::richcrab::v1::RoomId {
                                    value: state.room_id.clone(),
                                }),
                                quiz_id: Some(proto::richcrab::v1::QuizId {
                                    value: state.quiz_id.clone(),
                                }),
                            },
                        )),
                        emitted_at: Some(
                            prost_types::Timestamp::from(std::time::SystemTime::now()),
                        ),
                    });

                    let _ = response.send(Ok(()));
                }
                RoomCommand::SubmitAnswer {
                    player_id,
                    question_id,
                    answer,
                    response,
                } => {
                    let Some(round) = state.current_question.as_mut() else {
                        let _ = response.send(Err("no active question".to_string()));
                        continue;
                    };
                    if round.question_id != question_id {
                        let _ = response.send(Err("invalid question".to_string()));
                        continue;
                    }
                    if !round.answers_locked.insert(player_id.clone()) {
                        let _ = response.send(Err("answer already submitted".to_string()));
                        continue;
                    }

                    let score_delta = if answer.eq_ignore_ascii_case("correct") {
                        100
                    } else {
                        0
                    };
                    let mut updated_score = 0;
                    if let Some(player) = state.players.get_mut(&player_id) {
                        player.score = player.score.saturating_add(score_delta);
                        updated_score = player.score;
                    }
                    state.updated_at = Utc::now();

                    let _ = events_tx.send(proto::richcrab::v1::RoomEvent {
                        payload: Some(proto::richcrab::v1::room_event::Payload::AnswerLocked(
                            proto::richcrab::v1::AnswerLockedEvent {
                                room_id: Some(proto::richcrab::v1::RoomId {
                                    value: state.room_id.clone(),
                                }),
                                player_id: Some(proto::richcrab::v1::PlayerId {
                                    value: player_id.clone(),
                                }),
                                question_id: question_id.clone(),
                            },
                        )),
                        emitted_at: Some(
                            prost_types::Timestamp::from(std::time::SystemTime::now()),
                        ),
                    });
                    let _ = events_tx.send(proto::richcrab::v1::RoomEvent {
                        payload: Some(proto::richcrab::v1::room_event::Payload::ScoreUpdated(
                            proto::richcrab::v1::ScoreUpdatedEvent {
                                room_id: Some(proto::richcrab::v1::RoomId {
                                    value: state.room_id.clone(),
                                }),
                                player_id: Some(proto::richcrab::v1::PlayerId { value: player_id }),
                                score: updated_score,
                                delta: score_delta,
                            },
                        )),
                        emitted_at: Some(
                            prost_types::Timestamp::from(std::time::SystemTime::now()),
                        ),
                    });

                    if round.answers_locked.len() == state.players.len() {
                        state.state = RoomLifecycleState::Finished;
                        let mut final_scores = HashMap::new();
                        let mut winner = None;
                        let mut best = 0;
                        for player in state.players.values() {
                            final_scores.insert(player.player_id.clone(), player.score);
                            if player.score >= best {
                                best = player.score;
                                winner = Some(player.player_id.clone());
                            }
                        }
                        state.result = Some(GameResult {
                            winner_player_id: winner,
                            final_scores,
                        });
                    }

                    let _ = response.send(Ok(score_delta));
                }
                RoomCommand::GetState { response } => {
                    let _ = response.send(state.clone());
                }
            }
        }
    });

    (handle, task)
}
