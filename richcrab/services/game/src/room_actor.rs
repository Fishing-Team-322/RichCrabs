use std::{collections::HashMap, sync::Arc};

use chrono::Utc;
use tokio::sync::{broadcast, mpsc, oneshot, RwLock};
use tracing::info;

use crate::domain::{
    GameResult, Player, QuestionRound, RoomLifecycleState, RoomState, RoundTimer, Team,
};

#[derive(Debug)]
pub enum RoomCommand {
    Join {
        user_id: String,
        display_name: String,
        response: oneshot::Sender<Result<String, String>>,
    },
    Leave {
        player_id: String,
        response: oneshot::Sender<Result<(), String>>,
    },
    KickPlayer {
        requested_by: String,
        player_id: String,
        response: oneshot::Sender<Result<(), String>>,
    },
    StartGame {
        requested_by: String,
        response: oneshot::Sender<Result<(), String>>,
    },
    PauseGame {
        requested_by: String,
        response: oneshot::Sender<Result<(), String>>,
    },
    ResumeGame {
        requested_by: String,
        response: oneshot::Sender<Result<(), String>>,
    },
    NextQuestion {
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

fn now_ts() -> Option<prost_types::Timestamp> {
    Some(prost_types::Timestamp::from(std::time::SystemTime::now()))
}

fn team_scores(state: &RoomState) -> Vec<proto::richcrab::v1::TeamScore> {
    state
        .teams
        .values()
        .map(|team| proto::richcrab::v1::TeamScore {
            team_id: team.team_id.clone(),
            score: team.score,
        })
        .collect()
}

fn pick_team(state: &RoomState) -> String {
    let a_count = state
        .players
        .values()
        .filter(|p| p.team_id.as_deref() == Some("A"))
        .count();
    let b_count = state
        .players
        .values()
        .filter(|p| p.team_id.as_deref() == Some("B"))
        .count();
    if a_count <= b_count {
        "A".to_string()
    } else {
        "B".to_string()
    }
}

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
        state.teams.insert(
            "A".to_string(),
            Team {
                team_id: "A".to_string(),
                score: 0,
            },
        );
        state.teams.insert(
            "B".to_string(),
            Team {
                team_id: "B".to_string(),
                score: 0,
            },
        );

        let _ = events_tx.send(proto::richcrab::v1::RoomEvent {
            payload: Some(proto::richcrab::v1::room_event::Payload::RoomCreated(
                proto::richcrab::v1::RoomCreatedEvent {
                    room_id: Some(proto::richcrab::v1::RoomId {
                        value: state.room_id.clone(),
                    }),
                    quiz_id: Some(proto::richcrab::v1::QuizId {
                        value: state.quiz_id.clone(),
                    }),
                    title: state.title.clone(),
                },
            )),
            emitted_at: now_ts(),
        });

        while let Some(command) = rx.recv().await {
            match command {
                RoomCommand::Join {
                    user_id,
                    display_name,
                    response,
                } => {
                    let player_id = uuid::Uuid::new_v4().to_string();
                    let assigned_team = pick_team(&state);
                    let player = Player {
                        player_id: player_id.clone(),
                        user_id,
                        display_name: display_name.clone(),
                        score: 0,
                        team_id: Some(assigned_team.clone()),
                    };
                    state.players.insert(player_id.clone(), player);
                    state.updated_at = Utc::now();
                    info!(room_id = %state.room_id, room_title = %state.title, player_id = %player_id, team_id = %assigned_team, "player joined");

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
                        emitted_at: now_ts(),
                    });

                    let _ = events_tx.send(proto::richcrab::v1::RoomEvent {
                        payload: Some(proto::richcrab::v1::room_event::Payload::TeamsAssigned(
                            proto::richcrab::v1::TeamsAssignedEvent {
                                room_id: Some(proto::richcrab::v1::RoomId {
                                    value: state.room_id.clone(),
                                }),
                                player_id: Some(proto::richcrab::v1::PlayerId {
                                    value: player_id.clone(),
                                }),
                                team_id: assigned_team,
                                team_scores: team_scores(&state),
                            },
                        )),
                        emitted_at: now_ts(),
                    });

                    let _ = response.send(Ok(player_id));
                }
                RoomCommand::Leave {
                    player_id,
                    response,
                } => {
                    if state.players.remove(&player_id).is_none() {
                        let _ = response.send(Err("player not found".to_string()));
                        continue;
                    }
                    state.updated_at = Utc::now();
                    let _ = events_tx.send(proto::richcrab::v1::RoomEvent {
                        payload: Some(proto::richcrab::v1::room_event::Payload::PlayerLeft(
                            proto::richcrab::v1::PlayerLeftEvent {
                                room_id: Some(proto::richcrab::v1::RoomId {
                                    value: state.room_id.clone(),
                                }),
                                player_id: Some(proto::richcrab::v1::PlayerId { value: player_id }),
                            },
                        )),
                        emitted_at: now_ts(),
                    });
                    if state.players.is_empty() && state.state == RoomLifecycleState::Lobby {
                        state.state = RoomLifecycleState::Closed;
                        let _ = events_tx.send(proto::richcrab::v1::RoomEvent {
                            payload: Some(proto::richcrab::v1::room_event::Payload::RoomClosed(
                                proto::richcrab::v1::RoomClosedEvent {
                                    room_id: Some(proto::richcrab::v1::RoomId {
                                        value: state.room_id.clone(),
                                    }),
                                    reason: "all players left lobby".to_string(),
                                },
                            )),
                            emitted_at: now_ts(),
                        });
                    }
                    let _ = response.send(Ok(()));
                }
                RoomCommand::KickPlayer {
                    requested_by,
                    player_id,
                    response,
                } => {
                    if requested_by != state.owner_user_id {
                        let _ = response.send(Err("only owner can kick players".to_string()));
                        continue;
                    }
                    if state.players.remove(&player_id).is_none() {
                        let _ = response.send(Err("player not found".to_string()));
                        continue;
                    }
                    let _ = events_tx.send(proto::richcrab::v1::RoomEvent {
                        payload: Some(proto::richcrab::v1::room_event::Payload::PlayerLeft(
                            proto::richcrab::v1::PlayerLeftEvent {
                                room_id: Some(proto::richcrab::v1::RoomId {
                                    value: state.room_id.clone(),
                                }),
                                player_id: Some(proto::richcrab::v1::PlayerId { value: player_id }),
                            },
                        )),
                        emitted_at: now_ts(),
                    });
                    let _ = response.send(Ok(()));
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
                        question_text: "Placeholder question".to_string(),
                        options: vec!["A".to_string(), "B".to_string()],
                        started_at: Utc::now(),
                        answers_locked: Default::default(),
                    });
                    state.timer = Some(RoundTimer {
                        started_at: Utc::now(),
                        duration_secs: 30,
                    });
                    state.updated_at = Utc::now();
                    info!(room_id = %state.room_id, room_title = %state.title, owner_user_id = %state.owner_user_id, "game started");

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
                        emitted_at: now_ts(),
                    });

                    if let (Some(timer), Some(round)) = (&state.timer, &state.current_question) {
                        let ends_at = round
                            .started_at
                            .checked_add_signed(chrono::Duration::seconds(i64::from(
                                timer.duration_secs,
                            )))
                            .map(|deadline| prost_types::Timestamp {
                                seconds: deadline.timestamp(),
                                nanos: deadline.timestamp_subsec_nanos() as i32,
                            });
                        let _ = events_tx.send(proto::richcrab::v1::RoomEvent {
                            payload: Some(
                                proto::richcrab::v1::room_event::Payload::QuestionStarted(
                                    proto::richcrab::v1::QuestionStartedEvent {
                                        room_id: Some(proto::richcrab::v1::RoomId {
                                            value: state.room_id.clone(),
                                        }),
                                        question_id: round.question_id.clone(),
                                        question_text: round.question_text.clone(),
                                        options: round.options.clone(),
                                        ends_at,
                                    },
                                ),
                            ),
                            emitted_at: now_ts(),
                        });
                    }

                    let _ = response.send(Ok(()));
                }
                RoomCommand::PauseGame {
                    requested_by,
                    response,
                } => {
                    if requested_by != state.owner_user_id {
                        let _ = response.send(Err("only owner can pause game".to_string()));
                        continue;
                    }
                    if state.state != RoomLifecycleState::InProgress {
                        let _ = response.send(Err("game is not in progress".to_string()));
                        continue;
                    }
                    state.state = RoomLifecycleState::Paused;
                    state.updated_at = Utc::now();
                    let _ = response.send(Ok(()));
                }
                RoomCommand::ResumeGame {
                    requested_by,
                    response,
                } => {
                    if requested_by != state.owner_user_id {
                        let _ = response.send(Err("only owner can resume game".to_string()));
                        continue;
                    }
                    if state.state != RoomLifecycleState::Paused {
                        let _ = response.send(Err("game is not paused".to_string()));
                        continue;
                    }
                    state.state = RoomLifecycleState::InProgress;
                    state.updated_at = Utc::now();
                    let _ = response.send(Ok(()));
                }
                RoomCommand::NextQuestion {
                    requested_by,
                    response,
                } => {
                    if requested_by != state.owner_user_id {
                        let _ =
                            response.send(Err("only owner can move to next question".to_string()));
                        continue;
                    }
                    state.current_question = Some(QuestionRound {
                        question_id: uuid::Uuid::new_v4().to_string(),
                        question_text: "Next placeholder question".to_string(),
                        options: vec!["A".to_string(), "B".to_string()],
                        started_at: Utc::now(),
                        answers_locked: Default::default(),
                    });
                    state.timer = Some(RoundTimer {
                        started_at: Utc::now(),
                        duration_secs: 30,
                    });
                    state.updated_at = Utc::now();
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
                    let round_elapsed_secs = (Utc::now() - round.started_at).num_seconds();
                    if let Some(timer) = &state.timer {
                        let timer_elapsed_secs = (Utc::now() - timer.started_at).num_seconds();
                        if timer_elapsed_secs > i64::from(timer.duration_secs)
                            || round_elapsed_secs > i64::from(timer.duration_secs)
                        {
                            let _ = response.send(Err("round timed out".to_string()));
                            continue;
                        }
                    }
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
                        if let Some(team_id) = &player.team_id {
                            if let Some(team) = state.teams.get_mut(team_id) {
                                team.score = team.score.saturating_add(score_delta);
                            }
                        }
                    }
                    state.updated_at = Utc::now();
                    info!(room_id = %state.room_id, player_id = %player_id, score_delta, updated_score, "answer processed");

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
                        emitted_at: now_ts(),
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
                        emitted_at: now_ts(),
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
                            winner_player_id: winner.clone(),
                            final_scores,
                        });

                        let _ = events_tx.send(proto::richcrab::v1::RoomEvent {
                            payload: Some(proto::richcrab::v1::room_event::Payload::RoundEnded(
                                proto::richcrab::v1::RoundEndedEvent {
                                    room_id: Some(proto::richcrab::v1::RoomId {
                                        value: state.room_id.clone(),
                                    }),
                                    question_id,
                                    team_scores: team_scores(&state),
                                },
                            )),
                            emitted_at: now_ts(),
                        });

                        let _ = events_tx.send(proto::richcrab::v1::RoomEvent {
                            payload: Some(proto::richcrab::v1::room_event::Payload::GameEnded(
                                proto::richcrab::v1::GameEndedEvent {
                                    room_id: Some(proto::richcrab::v1::RoomId {
                                        value: state.room_id.clone(),
                                    }),
                                    winner_player_id: winner
                                        .map(|id| proto::richcrab::v1::PlayerId { value: id }),
                                    team_scores: team_scores(&state),
                                },
                            )),
                            emitted_at: now_ts(),
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

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashSet;

    use crate::domain::{RoomLifecycleState, RoomState};

    #[tokio::test]
    async fn submit_answer_fails_when_round_timed_out() {
        let room_state = RoomState {
            room_id: "room-1".to_string(),
            owner_user_id: "owner-1".to_string(),
            quiz_id: "quiz-1".to_string(),
            title: "Timeout room".to_string(),
            state: RoomLifecycleState::InProgress,
            players: HashMap::new(),
            teams: HashMap::new(),
            current_question: Some(QuestionRound {
                question_id: "q1".to_string(),
                question_text: "Q".to_string(),
                options: vec!["A".to_string(), "B".to_string()],
                started_at: Utc::now() - chrono::Duration::seconds(60),
                answers_locked: HashSet::new(),
            }),
            timer: Some(RoundTimer {
                started_at: Utc::now() - chrono::Duration::seconds(60),
                duration_secs: 30,
            }),
            result: None,
            updated_at: Utc::now(),
        };

        let (room, _task) = spawn_room_actor(room_state, 8);

        let (tx, rx) = oneshot::channel();
        room.tx
            .send(RoomCommand::SubmitAnswer {
                player_id: "player-1".to_string(),
                question_id: "q1".to_string(),
                answer: "correct".to_string(),
                response: tx,
            })
            .await
            .expect("send submit answer");

        let result = rx.await.expect("receive submit answer result");
        assert_eq!(result.expect_err("must fail"), "round timed out");
    }
}
