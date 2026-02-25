use std::collections::{HashMap, HashSet};

use chrono::{DateTime, Utc};

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RoomLifecycleState {
    Lobby,
    InProgress,
    Finished,
}

impl RoomLifecycleState {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Lobby => "LOBBY",
            Self::InProgress => "IN_PROGRESS",
            Self::Finished => "FINISHED",
        }
    }
}

#[derive(Debug, Clone)]
pub struct Player {
    pub player_id: String,
    pub user_id: String,
    pub display_name: String,
    pub score: u32,
}

#[derive(Debug, Clone)]
pub struct QuestionRound {
    pub question_id: String,
    pub started_at: DateTime<Utc>,
    pub answers_locked: HashSet<String>,
}

#[derive(Debug, Clone)]
pub struct RoundTimer {
    pub started_at: DateTime<Utc>,
    pub duration_secs: u32,
}

#[derive(Debug, Clone)]
pub struct GameResult {
    pub winner_player_id: Option<String>,
    pub final_scores: HashMap<String, u32>,
}

#[derive(Debug, Clone)]
pub struct RoomState {
    pub room_id: String,
    pub owner_user_id: String,
    pub quiz_id: String,
    pub title: String,
    pub state: RoomLifecycleState,
    pub players: HashMap<String, Player>,
    pub current_question: Option<QuestionRound>,
    pub timer: Option<RoundTimer>,
    pub result: Option<GameResult>,
    pub updated_at: DateTime<Utc>,
}
