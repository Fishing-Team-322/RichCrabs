use std::collections::{HashMap, HashSet};

use chrono::{DateTime, Utc};

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RoomLifecycleState {
    Lobby,
    InProgress,
    Paused,
    Finished,
    Closed,
}

impl RoomLifecycleState {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Lobby => "LOBBY",
            Self::InProgress => "IN_PROGRESS",
            Self::Paused => "PAUSED",
            Self::Finished => "FINISHED",
            Self::Closed => "CLOSED",
        }
    }
}

#[derive(Debug, Clone)]
pub struct Team {
    pub team_id: String,
    pub score: u32,
}

#[derive(Debug, Clone)]
#[allow(dead_code)]
pub struct Player {
    pub player_id: String,
    pub user_id: String,
    pub display_name: String,
    pub score: u32,
    pub team_id: Option<String>,
}

#[derive(Debug, Clone)]
pub struct GameQuestion {
    pub question_id: String,
    pub question_text: String,
    pub options: Vec<String>,
    pub correct_option_index: Option<u32>,
}

#[derive(Debug, Clone)]
#[allow(dead_code)]
pub struct QuestionRound {
    pub question_index: usize,
    pub question_id: String,
    pub question_text: String,
    pub options: Vec<String>,
    pub started_at: DateTime<Utc>,
    pub ends_at: DateTime<Utc>,
    pub answers_locked: HashSet<String>,
    pub active_team_id: String,
}

#[derive(Debug, Clone)]
#[allow(dead_code)]
pub struct RoundTimer {
    pub started_at: DateTime<Utc>,
    pub duration_secs: u32,
}

#[derive(Debug, Clone)]
#[allow(dead_code)]
pub struct GameResult {
    pub winner_player_id: Option<String>,
    pub winner_team_id: Option<String>,
    pub final_scores: HashMap<String, u32>,
    pub final_team_scores: HashMap<String, u32>,
}

#[derive(Debug, Clone)]
pub struct RoomState {
    pub room_id: String,
    pub owner_user_id: String,
    pub quiz_id: String,
    pub title: String,
    pub state: RoomLifecycleState,
    pub players: HashMap<String, Player>,
    pub teams: HashMap<String, Team>,
    pub question_bank: Vec<GameQuestion>,
    pub current_question: Option<QuestionRound>,
    pub timer: Option<RoundTimer>,
    pub result: Option<GameResult>,
    pub updated_at: DateTime<Utc>,
}
