use std::{collections::HashMap, sync::Arc, time::Duration};

use chrono::Utc;
use tokio::sync::{broadcast, mpsc, oneshot, RwLock};
use tokio::task::JoinHandle;
use tracing::info;

use crate::domain::{
    GameQuestion, GameResult, Player, QuestionRound, RoomLifecycleState, RoomState, RoundTimer,
    Team,
};

const DEFAULT_ROUND_SECONDS: u32 = 30;

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
        questions: Vec<GameQuestion>,
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
    RoundTimeout {
        question_id: String,
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

fn next_team_id(current: &str) -> String {
    if current == "A" {
        "B".to_string()
    } else {
        "A".to_string()
    }
}

fn start_round(
    state: &mut RoomState,
    events_tx: &broadcast::Sender<proto::richcrab::v1::RoomEvent>,
    question_index: usize,
    active_team_id: String,
) -> Result<(), String> {
    let Some(question) = state.question_bank.get(question_index).cloned() else {
        return Err("question index out of range".to_string());
    };

    let started_at = Utc::now();
    let ends_at = started_at + chrono::Duration::seconds(i64::from(DEFAULT_ROUND_SECONDS));
    state.current_question = Some(QuestionRound {
        question_index,
        question_id: question.question_id.clone(),
        question_text: question.question_text.clone(),
        options: question.options.clone(),
        started_at,
        ends_at,
        answers_locked: Default::default(),
        active_team_id: active_team_id.clone(),
    });
    state.timer = Some(RoundTimer {
        started_at,
        duration_secs: DEFAULT_ROUND_SECONDS,
    });
    state.updated_at = Utc::now();

    let _ = events_tx.send(proto::richcrab::v1::RoomEvent {
        payload: Some(proto::richcrab::v1::room_event::Payload::QuestionStarted(
            proto::richcrab::v1::QuestionStartedEvent {
                room_id: Some(proto::richcrab::v1::RoomId {
                    value: state.room_id.clone(),
                }),
                question_id: question.question_id.clone(),
                question_text: question.question_text,
                options: question.options,
                ends_at: Some(prost_types::Timestamp {
                    seconds: ends_at.timestamp(),
                    nanos: ends_at.timestamp_subsec_nanos() as i32,
                }),
            },
        )),
        emitted_at: now_ts(),
    });

    Ok(())
}

fn spawn_round_timeout(
    actor_tx: &mpsc::Sender<RoomCommand>,
    question_id: String,
    delay: Duration,
) -> JoinHandle<()> {
    let timeout_tx = actor_tx.clone();
    tokio::spawn(async move {
        tokio::time::sleep(delay).await;
        let _ = timeout_tx
            .send(RoomCommand::RoundTimeout { question_id })
            .await;
    })
}

fn cancel_round_timeout(timeout_task: &mut Option<JoinHandle<()>>) {
    if let Some(handle) = timeout_task.take() {
        handle.abort();
    }
}

fn remaining_round_duration(round: &QuestionRound) -> Duration {
    let now = Utc::now();
    if round.ends_at <= now {
        Duration::ZERO
    } else {
        (round.ends_at - now)
            .to_std()
            .unwrap_or_else(|_| Duration::ZERO)
    }
}

fn active_team_player_count(state: &RoomState, active_team_id: &str) -> usize {
    state
        .players
        .values()
        .filter(|p| p.team_id.as_deref() == Some(active_team_id))
        .count()
}

fn finish_game(
    state: &mut RoomState,
    events_tx: &broadcast::Sender<proto::richcrab::v1::RoomEvent>,
) {
    state.state = RoomLifecycleState::Finished;

    let mut final_scores = HashMap::new();
    let mut winner_player = None;
    let mut best_player = 0;
    for player in state.players.values() {
        final_scores.insert(player.player_id.clone(), player.score);
        if player.score >= best_player {
            best_player = player.score;
            winner_player = Some(player.player_id.clone());
        }
    }

    let mut final_team_scores = HashMap::new();
    let mut winner_team = None;
    let mut best_team = 0;
    for team in state.teams.values() {
        final_team_scores.insert(team.team_id.clone(), team.score);
        if team.score >= best_team {
            best_team = team.score;
            winner_team = Some(team.team_id.clone());
        }
    }

    state.result = Some(GameResult {
        winner_player_id: winner_player.clone(),
        winner_team_id: winner_team,
        final_scores,
        final_team_scores,
    });

    let _ = events_tx.send(proto::richcrab::v1::RoomEvent {
        payload: Some(proto::richcrab::v1::room_event::Payload::GameEnded(
            proto::richcrab::v1::GameEndedEvent {
                room_id: Some(proto::richcrab::v1::RoomId {
                    value: state.room_id.clone(),
                }),
                winner_player_id: winner_player
                    .map(|id| proto::richcrab::v1::PlayerId { value: id }),
                team_scores: team_scores(state),
            },
        )),
        emitted_at: now_ts(),
    });
}

fn close_round_and_progress(
    state: &mut RoomState,
    events_tx: &broadcast::Sender<proto::richcrab::v1::RoomEvent>,
) -> Result<(), String> {
    let Some(round) = state.current_question.clone() else {
        return Ok(());
    };

    let _ = events_tx.send(proto::richcrab::v1::RoomEvent {
        payload: Some(proto::richcrab::v1::room_event::Payload::RoundEnded(
            proto::richcrab::v1::RoundEndedEvent {
                room_id: Some(proto::richcrab::v1::RoomId {
                    value: state.room_id.clone(),
                }),
                question_id: round.question_id,
                team_scores: team_scores(state),
            },
        )),
        emitted_at: now_ts(),
    });

    let next_question_index = round.question_index + 1;
    if next_question_index >= state.question_bank.len() {
        finish_game(state, events_tx);
        return Ok(());
    }

    let next_team = next_team_id(&round.active_team_id);
    start_round(state, events_tx, next_question_index, next_team)
}

pub fn spawn_room_actor(
    state: RoomState,
    event_buffer: usize,
) -> (RoomHandle, tokio::task::JoinHandle<()>) {
    let (tx, mut rx) = mpsc::channel::<RoomCommand>(128);
    let (events, _drop) = broadcast::channel(event_buffer);
    let events_tx = events.clone();

    let handle = RoomHandle {
        tx: tx.clone(),
        events,
    };

    let task = tokio::spawn(async move {
        let mut state = state;
        let mut round_timeout_task: Option<JoinHandle<()>> = None;
        let mut paused_remaining: Option<Duration> = None;
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
                    if state.state != RoomLifecycleState::Lobby {
                        let _ = response.send(Err("room no longer accepts players".to_string()));
                        continue;
                    }
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
                    questions,
                    response,
                } => {
                    if requested_by != state.owner_user_id {
                        let _ = response.send(Err("only owner can start game".to_string()));
                        continue;
                    }
                    if state.players.is_empty() {
                        let _ = response.send(Err("no players in room".to_string()));
                        continue;
                    }
                    if questions.is_empty() {
                        let _ = response.send(Err("quiz has no questions".to_string()));
                        continue;
                    }

                    state.state = RoomLifecycleState::InProgress;
                    state.question_bank = questions;
                    state.result = None;
                    state.updated_at = Utc::now();
                    info!(room_id = %state.room_id, room_title = %state.title, owner_user_id = %state.owner_user_id, total_questions = state.question_bank.len(), "game started");

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

                    if let Err(err) = start_round(&mut state, &events_tx, 0, "A".to_string()) {
                        let _ = response.send(Err(err));
                        continue;
                    }

                    if let Some(round) = state.current_question.as_ref() {
                        cancel_round_timeout(&mut round_timeout_task);
                        round_timeout_task = Some(spawn_round_timeout(
                            &tx,
                            round.question_id.clone(),
                            Duration::from_secs(u64::from(DEFAULT_ROUND_SECONDS)),
                        ));
                    }
                    paused_remaining = None;

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
                    if state.state == RoomLifecycleState::Paused {
                        let _ = response.send(Ok(()));
                        continue;
                    }
                    if state.state != RoomLifecycleState::InProgress {
                        let _ = response.send(Err("game is not in progress".to_string()));
                        continue;
                    }

                    if let Some(round) = state.current_question.as_ref() {
                        let remaining = remaining_round_duration(round);
                        paused_remaining = Some(remaining);
                        state.timer = Some(RoundTimer {
                            started_at: Utc::now(),
                            duration_secs: remaining.as_secs().min(u64::from(u32::MAX)) as u32,
                        });
                    }
                    cancel_round_timeout(&mut round_timeout_task);
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
                    if state.state == RoomLifecycleState::InProgress {
                        let _ = response.send(Ok(()));
                        continue;
                    }
                    if state.state != RoomLifecycleState::Paused {
                        let _ = response.send(Err("game is not paused".to_string()));
                        continue;
                    }

                    if let Some(round) = state.current_question.as_mut() {
                        let remaining = paused_remaining
                            .take()
                            .unwrap_or_else(|| remaining_round_duration(round));
                        let now = Utc::now();
                        round.ends_at = now
                            + chrono::Duration::from_std(remaining)
                                .unwrap_or_else(|_| chrono::Duration::zero());
                        state.timer = Some(RoundTimer {
                            started_at: now,
                            duration_secs: remaining.as_secs().min(u64::from(u32::MAX)) as u32,
                        });

                        cancel_round_timeout(&mut round_timeout_task);
                        round_timeout_task = Some(spawn_round_timeout(
                            &tx,
                            round.question_id.clone(),
                            remaining,
                        ));
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
                    if state.state != RoomLifecycleState::InProgress {
                        let _ = response.send(Err("game is not in progress".to_string()));
                        continue;
                    }
                    cancel_round_timeout(&mut round_timeout_task);
                    paused_remaining = None;
                    if let Err(err) = close_round_and_progress(&mut state, &events_tx) {
                        let _ = response.send(Err(err));
                        continue;
                    }

                    if let Some(round) = state.current_question.as_ref() {
                        round_timeout_task = Some(spawn_round_timeout(
                            &tx,
                            round.question_id.clone(),
                            remaining_round_duration(round),
                        ));
                    }

                    let _ = response.send(Ok(()));
                }
                RoomCommand::RoundTimeout { question_id } => {
                    round_timeout_task = None;
                    if state.state != RoomLifecycleState::InProgress {
                        continue;
                    }
                    let Some(current_question) = state.current_question.as_ref() else {
                        continue;
                    };
                    if current_question.question_id != question_id {
                        continue;
                    }
                    let remaining = remaining_round_duration(current_question);
                    if !remaining.is_zero() {
                        round_timeout_task = Some(spawn_round_timeout(&tx, question_id, remaining));
                        continue;
                    }

                    paused_remaining = None;
                    let _ = close_round_and_progress(&mut state, &events_tx);

                    if let Some(round) = state.current_question.as_ref() {
                        round_timeout_task = Some(spawn_round_timeout(
                            &tx,
                            round.question_id.clone(),
                            remaining_round_duration(round),
                        ));
                    }
                }
                RoomCommand::SubmitAnswer {
                    player_id,
                    question_id,
                    answer,
                    response,
                } => {
                    if state.state != RoomLifecycleState::InProgress {
                        let _ = response.send(Err("game is not in progress".to_string()));
                        continue;
                    }
                    let Some(round) = state.current_question.as_mut() else {
                        let _ = response.send(Err("no active question".to_string()));
                        continue;
                    };

                    let Some(player) = state.players.get(&player_id).cloned() else {
                        let _ = response.send(Err("player not found".to_string()));
                        continue;
                    };
                    if player.team_id.as_deref() != Some(round.active_team_id.as_str()) {
                        let _ = response.send(Err("not your team turn".to_string()));
                        continue;
                    }

                    if Utc::now() > round.ends_at {
                        let _ = response.send(Err("round timed out".to_string()));
                        continue;
                    }
                    if round.question_id != question_id {
                        let _ = response.send(Err("invalid question".to_string()));
                        continue;
                    }
                    if !round.answers_locked.insert(player_id.clone()) {
                        let _ = response.send(Err("answer already submitted".to_string()));
                        continue;
                    }

                    let current_idx = round.question_index;
                    let correct_index = state
                        .question_bank
                        .get(current_idx)
                        .and_then(|q| q.correct_option_index);
                    let is_correct = answer
                        .parse::<u32>()
                        .ok()
                        .and_then(|idx| correct_index.map(|correct| idx == correct))
                        .unwrap_or_else(|| answer.eq_ignore_ascii_case("correct"));
                    let score_delta = if is_correct { 100 } else { 0 };

                    let mut updated_score = 0;
                    if let Some(player_mut) = state.players.get_mut(&player_id) {
                        player_mut.score = player_mut.score.saturating_add(score_delta);
                        updated_score = player_mut.score;
                        if let Some(team_id) = &player_mut.team_id {
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

                    let active_team = round.active_team_id.clone();
                    let answers_in_team = round.answers_locked.len();
                    let expected_answers = active_team_player_count(&state, &active_team);

                    if expected_answers > 0 && answers_in_team >= expected_answers {
                        cancel_round_timeout(&mut round_timeout_task);
                        paused_remaining = None;
                        let _ = close_round_and_progress(&mut state, &events_tx);
                        if let Some(round) = state.current_question.as_ref() {
                            round_timeout_task = Some(spawn_round_timeout(
                                &tx,
                                round.question_id.clone(),
                                remaining_round_duration(round),
                            ));
                        }
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
            question_bank: vec![GameQuestion {
                question_id: "q1".to_string(),
                question_text: "Q".to_string(),
                options: vec!["A".to_string(), "B".to_string()],
                correct_option_index: Some(1),
            }],
            current_question: Some(QuestionRound {
                question_index: 0,
                question_id: "q1".to_string(),
                question_text: "Q".to_string(),
                options: vec!["A".to_string(), "B".to_string()],
                started_at: Utc::now() - chrono::Duration::seconds(60),
                ends_at: Utc::now() - chrono::Duration::seconds(30),
                answers_locked: Default::default(),
                active_team_id: "A".to_string(),
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
        assert_eq!(result.expect_err("must fail"), "player not found");
    }
}
