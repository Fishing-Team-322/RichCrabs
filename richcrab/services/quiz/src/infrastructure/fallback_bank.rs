use std::{fs, path::PathBuf};

use anyhow::Context;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
struct FallbackQuestionBank {
    questions: Vec<FallbackQuestion>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct FallbackQuestion {
    text: String,
    options: Vec<String>,
    correct_option_index: Option<u32>,
}

pub(crate) fn load_fallback_question_bank() -> anyhow::Result<Vec<proto::richcrab::v1::QuizQuestion>>
{
    let mut path = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    path.push("fallback_question_bank.json");
    let json = fs::read_to_string(&path)
        .with_context(|| format!("failed to load fallback bank: {}", path.display()))?;
    let parsed: FallbackQuestionBank =
        serde_json::from_str(&json).context("failed to parse fallback bank")?;
    Ok(parsed
        .questions
        .into_iter()
        .enumerate()
        .map(|(idx, q)| proto::richcrab::v1::QuizQuestion {
            id: format!("fallback-{}", idx + 1),
            text: q.text,
            options: q.options,
            correct_option_index: q.correct_option_index,
        })
        .collect())
}
