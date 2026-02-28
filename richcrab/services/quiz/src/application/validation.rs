use anyhow::Result;
use chrono::Utc;
use serde::Deserialize;
use std::collections::HashSet;
use uuid::Uuid;

#[derive(Debug, Deserialize)]
pub(crate) struct GeneratedQuizPayload {
    pub(crate) title: String,
    pub(crate) description: Option<String>,
    pub(crate) questions: Vec<GeneratedQuestionPayload>,
}

#[derive(Debug, Deserialize)]
pub(crate) struct GeneratedQuestionPayload {
    pub(crate) text: String,
    pub(crate) options: Vec<String>,
    pub(crate) correct_option_index: Option<u32>,
    pub(crate) correct_option: Option<String>,
}

pub(crate) fn validate_questions(
    questions: &[proto::richcrab::v1::QuizQuestion],
) -> Result<(), String> {
    if questions.is_empty() {
        return Err("quiz must contain at least one question".to_string());
    }

    for (idx, q) in questions.iter().enumerate() {
        if q.text.trim().is_empty() {
            return Err(format!("question[{idx}] text must not be empty"));
        }
        if q.text.len() > 160 {
            return Err(format!(
                "question[{idx}] text must be at most 160 characters"
            ));
        }
        if q.options.len() != 4 {
            return Err(format!("question[{idx}] must contain exactly 4 options"));
        }

        let mut unique_options = HashSet::new();
        for (opt_idx, option) in q.options.iter().enumerate() {
            let trimmed = option.trim();
            if trimmed.is_empty() {
                return Err(format!(
                    "question[{idx}] option[{opt_idx}] must not be empty"
                ));
            }
            if trimmed.len() > 160 {
                return Err(format!(
                    "question[{idx}] option[{opt_idx}] must be at most 160 characters"
                ));
            }

            let normalized = trimmed.to_lowercase();
            if !unique_options.insert(normalized) {
                return Err(format!(
                    "question[{idx}] option[{opt_idx}] duplicates another option"
                ));
            }
        }

        let Some(correct_idx) = q.correct_option_index else {
            return Err(format!("question[{idx}] correct_option_index is required"));
        };

        if correct_idx > 3 {
            return Err(format!(
                "question[{idx}] correct_option_index must be in range 0..=3"
            ));
        }
        if (correct_idx as usize) >= q.options.len() {
            return Err(format!("question[{idx}] has invalid correct_option_index"));
        }
    }

    Ok(())
}

pub(crate) fn strip_markdown_code_fence(raw: &str) -> &str {
    let trimmed = raw.trim();
    if let Some(rest) = trimmed.strip_prefix("```") {
        let without_lang = rest
            .find('\n')
            .and_then(|idx| rest.get(idx + 1..))
            .unwrap_or(rest);
        return without_lang.trim_end_matches("```").trim();
    }
    trimmed
}

pub(crate) fn build_quiz_from_generated_payload(
    owner_user_id: Uuid,
    parsed: GeneratedQuizPayload,
) -> Result<proto::richcrab::v1::Quiz> {
    let questions = parsed
        .questions
        .into_iter()
        .enumerate()
        .map(|(idx, q)| {
            let normalized_correct_option = q.correct_option.as_deref().map(str::trim);
            let correct_option_index_from_text = normalized_correct_option
                .map(|correct_option| {
                    q.options
                        .iter()
                        .position(|option| option.trim() == correct_option)
                        .map(|position| position as u32)
                        .ok_or_else(|| {
                            anyhow::anyhow!(
                                "question[{idx}] correct_option does not match any option"
                            )
                        })
                })
                .transpose()?;

            let correct_option_index =
                match (q.correct_option_index, correct_option_index_from_text) {
                    (Some(index_from_payload), Some(index_from_text)) => {
                        if index_from_payload != index_from_text {
                            return Err(anyhow::anyhow!(
                                "question[{idx}] correct_option conflicts with correct_option_index"
                            ));
                        }
                        Some(index_from_payload)
                    }
                    (Some(index), None) => Some(index),
                    (None, Some(index)) => Some(index),
                    (None, None) => None,
                };

            Ok(proto::richcrab::v1::QuizQuestion {
                id: format!("ai-{}", idx + 1),
                text: q.text,
                options: q.options,
                correct_option_index,
            })
        })
        .collect::<Result<Vec<_>>>()?;

    validate_questions(&questions).map_err(anyhow::Error::msg)?;

    let now = Utc::now();
    Ok(proto::richcrab::v1::Quiz {
        quiz_id: Some(proto::richcrab::v1::QuizId {
            value: Uuid::new_v4().to_string(),
        }),
        owner_user_id: Some(proto::richcrab::v1::UserId {
            value: owner_user_id.to_string(),
        }),
        title: parsed.title,
        description: parsed
            .description
            .unwrap_or_else(|| "Generated by AI".to_string()),
        questions,
        created_at: Some(prost_types::Timestamp {
            seconds: now.timestamp(),
            nanos: now.timestamp_subsec_nanos() as i32,
        }),
        updated_at: Some(prost_types::Timestamp {
            seconds: now.timestamp(),
            nanos: now.timestamp_subsec_nanos() as i32,
        }),
    })
}

pub(crate) fn parse_generated_quiz_content(
    owner_user_id: Uuid,
    raw_content: &str,
) -> Result<proto::richcrab::v1::Quiz> {
    let normalized = strip_markdown_code_fence(raw_content);
    let parsed: GeneratedQuizPayload = match serde_json::from_str(normalized) {
        Ok(parsed) => parsed,
        Err(primary_err) => {
            let json_fragment = extract_first_json_object(normalized)
                .ok_or_else(|| anyhow::anyhow!(primary_err.to_string()))?;
            serde_json::from_str(json_fragment)
                .map_err(|_| anyhow::anyhow!(primary_err.to_string()))?
        }
    };
    build_quiz_from_generated_payload(owner_user_id, parsed)
}

fn extract_first_json_object(raw: &str) -> Option<&str> {
    let mut depth = 0usize;
    let mut start = None;
    let mut in_string = false;
    let mut escaped = false;

    for (idx, ch) in raw.char_indices() {
        if in_string {
            if escaped {
                escaped = false;
                continue;
            }
            match ch {
                '\\' => escaped = true,
                '"' => in_string = false,
                _ => {}
            }
            continue;
        }

        match ch {
            '"' => in_string = true,
            '{' => {
                if depth == 0 {
                    start = Some(idx);
                }
                depth += 1;
            }
            '}' => {
                if depth == 0 {
                    continue;
                }
                depth -= 1;
                if depth == 0 {
                    if let Some(start_idx) = start {
                        return raw.get(start_idx..=idx);
                    }
                }
            }
            _ => {}
        }
    }

    None
}

#[cfg(test)]
mod tests {
    use super::*;

    fn q(text: &str, options: &[&str], correct: Option<u32>) -> proto::richcrab::v1::QuizQuestion {
        proto::richcrab::v1::QuizQuestion {
            id: "q1".to_string(),
            text: text.to_string(),
            options: options.iter().map(|s| s.to_string()).collect(),
            correct_option_index: correct,
        }
    }

    #[test]
    fn validate_questions_rejects_empty_list() {
        assert!(validate_questions(&[]).is_err());
    }

    #[test]
    fn validate_questions_rejects_invalid_correct_index() {
        assert!(validate_questions(&[q("Q", &["a", "b", "c", "d"], Some(4))]).is_err());
    }

    #[test]
    fn validate_questions_accepts_valid_payload() {
        assert!(validate_questions(&[q("Q", &["a", "b", "c", "d"], Some(1))]).is_ok());
    }

    #[test]
    fn validate_questions_rejects_text_longer_than_160() {
        let text = "q".repeat(161);
        assert!(validate_questions(&[q(&text, &["a", "b", "c", "d"], Some(1))]).is_err());
    }

    #[test]
    fn validate_questions_rejects_missing_correct_option_index() {
        assert!(validate_questions(&[q("Q", &["a", "b", "c", "d"], None)]).is_err());
    }

    #[test]
    fn validate_questions_rejects_non_four_options() {
        assert!(validate_questions(&[q("Q", &["a", "b", "c"], Some(1))]).is_err());
    }

    #[test]
    fn validate_questions_rejects_duplicate_options_after_normalization() {
        assert!(validate_questions(&[q("Q", &["Option", " option ", "c", "d"], Some(2))]).is_err());
    }

    #[test]
    fn strip_markdown_code_fence_extracts_json() {
        let raw = "```json\n{\"title\":\"T\"}\n```";
        assert_eq!(strip_markdown_code_fence(raw), "{\"title\":\"T\"}");
    }

    #[test]
    fn strip_markdown_code_fence_plain_json_untouched() {
        let raw = "{\"title\":\"T\"}";
        assert_eq!(strip_markdown_code_fence(raw), raw);
    }

    #[test]
    fn parse_generated_quiz_content_parses_and_validates_payload() {
        let owner = Uuid::new_v4();
        let raw = r#"{
            "title":"Rust Quiz",
            "description":"desc",
            "questions":[{
                "text":"Q1",
                "options":["A","B","C","D"],
                "correct_option_index":2
            }]
        }"#;

        let quiz = parse_generated_quiz_content(owner, raw).expect("generated quiz must parse");
        assert_eq!(quiz.title, "Rust Quiz");
        assert_eq!(quiz.questions[0].correct_option_index, Some(2));
    }

    #[test]
    fn parse_generated_quiz_content_fails_on_invalid_json() {
        let owner = Uuid::new_v4();
        assert!(parse_generated_quiz_content(owner, "```json\nnot-json\n```").is_err());
    }

    #[test]
    fn parse_generated_quiz_content_prefers_correct_option_index() {
        let owner = Uuid::new_v4();
        let raw = r#"{
            "title":"Rust Quiz",
            "questions":[{
                "text":"Q1",
                "options":["A","B","C","D"],
                "correct_option_index":2
            }]
        }"#;

        let quiz = parse_generated_quiz_content(owner, raw).expect("generated quiz must parse");
        assert_eq!(quiz.questions[0].correct_option_index, Some(2));
    }

    #[test]
    fn parse_generated_quiz_content_supports_only_correct_option_text() {
        let owner = Uuid::new_v4();
        let raw = r#"{
            "title":"Rust Quiz",
            "questions":[{
                "text":"Q1",
                "options":["A","B","C","D"],
                "correct_option":"  C "
            }]
        }"#;

        let quiz = parse_generated_quiz_content(owner, raw).expect("generated quiz must parse");
        assert_eq!(quiz.questions[0].correct_option_index, Some(2));
    }

    #[test]
    fn parse_generated_quiz_content_rejects_conflicting_index_and_text() {
        let owner = Uuid::new_v4();
        let raw = r#"{
            "title":"Rust Quiz",
            "questions":[{
                "text":"Q1",
                "options":["A","B","C","D"],
                "correct_option_index":0,
                "correct_option":"C"
            }]
        }"#;

        assert!(parse_generated_quiz_content(owner, raw).is_err());
    }

    #[test]
    fn parse_generated_quiz_content_rejects_unknown_correct_option_text() {
        let owner = Uuid::new_v4();
        let raw = r#"{
            "title":"Rust Quiz",
            "questions":[{
                "text":"Q1",
                "options":["A","B","C","D"],
                "correct_option":"Z"
            }]
        }"#;

        assert!(parse_generated_quiz_content(owner, raw).is_err());
    }
}
