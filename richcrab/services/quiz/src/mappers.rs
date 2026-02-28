use serde_json::{json, Value};

use crate::repository::Quiz;

pub(crate) fn questions_to_json(questions: &[proto::richcrab::v1::QuizQuestion]) -> Value {
    Value::Array(
        questions
            .iter()
            .map(|q| {
                json!({
                    "id": q.id,
                    "text": q.text,
                    "options": q.options,
                    "correct_option_index": q.correct_option_index,
                })
            })
            .collect(),
    )
}

pub(crate) fn questions_from_json(value: &Value) -> Vec<proto::richcrab::v1::QuizQuestion> {
    value
        .as_array()
        .cloned()
        .unwrap_or_default()
        .into_iter()
        .map(|raw| proto::richcrab::v1::QuizQuestion {
            id: raw
                .get("id")
                .and_then(Value::as_str)
                .unwrap_or_default()
                .to_string(),
            text: raw
                .get("text")
                .and_then(Value::as_str)
                .unwrap_or_default()
                .to_string(),
            options: raw
                .get("options")
                .and_then(Value::as_array)
                .cloned()
                .unwrap_or_default()
                .into_iter()
                .filter_map(|v| v.as_str().map(str::to_string))
                .collect(),
            correct_option_index: raw
                .get("correct_option_index")
                .and_then(Value::as_u64)
                .map(|v| v as u32),
        })
        .collect()
}

pub(crate) fn to_proto(quiz: &Quiz) -> proto::richcrab::v1::Quiz {
    let questions = questions_from_json(&quiz.questions_json);

    proto::richcrab::v1::Quiz {
        quiz_id: Some(proto::richcrab::v1::QuizId {
            value: quiz.id.to_string(),
        }),
        owner_user_id: Some(proto::richcrab::v1::UserId {
            value: quiz.owner_user_id.to_string(),
        }),
        title: quiz.title.clone(),
        description: quiz.description.clone(),
        questions,
        created_at: Some(prost_types::Timestamp {
            seconds: quiz.created_at.timestamp(),
            nanos: quiz.created_at.timestamp_subsec_nanos() as i32,
        }),
        updated_at: Some(prost_types::Timestamp {
            seconds: quiz.updated_at.timestamp(),
            nanos: quiz.updated_at.timestamp_subsec_nanos() as i32,
        }),
    }
}

pub(crate) fn quiz_to_json(quiz: &proto::richcrab::v1::Quiz) -> Value {
    json!({
        "quiz_id": quiz.quiz_id.as_ref().map(|v| v.value.clone()).unwrap_or_default(),
        "owner_user_id": quiz.owner_user_id.as_ref().map(|v| v.value.clone()).unwrap_or_default(),
        "title": quiz.title,
        "description": quiz.description,
        "questions": questions_to_json(&quiz.questions),
        "created_at": quiz.created_at.as_ref().map(|ts| ts.seconds).unwrap_or_default(),
        "updated_at": quiz.updated_at.as_ref().map(|ts| ts.seconds).unwrap_or_default(),
    })
}

pub(crate) fn quiz_from_json(value: &Value) -> Option<proto::richcrab::v1::Quiz> {
    let quiz_id = value.get("quiz_id")?.as_str()?.to_string();
    let owner_user_id = value.get("owner_user_id")?.as_str()?.to_string();
    let title = value.get("title")?.as_str()?.to_string();
    let description = value.get("description")?.as_str()?.to_string();
    Some(proto::richcrab::v1::Quiz {
        quiz_id: Some(proto::richcrab::v1::QuizId { value: quiz_id }),
        owner_user_id: Some(proto::richcrab::v1::UserId {
            value: owner_user_id,
        }),
        title,
        description,
        questions: questions_from_json(value.get("questions").unwrap_or(&Value::Null)),
        created_at: None,
        updated_at: None,
    })
}
