use chrono::Utc;
use tonic::Status;
use uuid::Uuid;

use crate::{
    application::validation::validate_questions,
    mappers::{questions_to_json, to_proto},
    repository::{Quiz, QuizRepository},
};

pub(crate) async fn create_quiz(
    repository: &QuizRepository,
    owner_uuid: Uuid,
    title: String,
    description: String,
    questions: Vec<proto::richcrab::v1::QuizQuestion>,
) -> Result<proto::richcrab::v1::Quiz, Status> {
    validate_questions(&questions).map_err(Status::invalid_argument)?;

    let now = Utc::now();
    let quiz = Quiz {
        id: Uuid::new_v4(),
        owner_user_id: owner_uuid,
        title,
        description,
        status: "draft".to_string(),
        published_version: 0,
        questions_json: questions_to_json(&questions),
        created_at: now,
        updated_at: now,
    };

    repository
        .create(&quiz)
        .await
        .map_err(|e| Status::internal(format!("create failed: {e}")))?;

    Ok(to_proto(&quiz))
}

pub(crate) async fn get_quiz(
    repository: &QuizRepository,
    quiz_uuid: Uuid,
) -> Result<proto::richcrab::v1::Quiz, Status> {
    let quiz = repository
        .find_by_id(quiz_uuid)
        .await
        .map_err(|e| Status::internal(format!("read failed: {e}")))?
        .ok_or_else(|| Status::not_found("quiz not found"))?;
    Ok(to_proto(&quiz))
}

pub(crate) async fn update_quiz(
    repository: &QuizRepository,
    quiz: proto::richcrab::v1::Quiz,
) -> Result<proto::richcrab::v1::Quiz, Status> {
    let id = quiz
        .quiz_id
        .as_ref()
        .map(|v| v.value.clone())
        .ok_or_else(|| Status::invalid_argument("quiz.quiz_id is required"))?;
    let parsed_id =
        Uuid::parse_str(&id).map_err(|_| Status::invalid_argument("quiz_id must be uuid"))?;

    validate_questions(&quiz.questions).map_err(Status::invalid_argument)?;

    let existing = repository
        .find_by_id(parsed_id)
        .await
        .map_err(|e| Status::internal(format!("read failed: {e}")))?
        .ok_or_else(|| Status::not_found("quiz not found"))?;
    if existing.status == "published" {
        return Err(Status::failed_precondition(
            "published quiz is immutable; create new draft version",
        ));
    }

    let updated = Quiz {
        title: quiz.title,
        description: quiz.description,
        questions_json: questions_to_json(&quiz.questions),
        ..existing
    };
    repository
        .update(&updated)
        .await
        .map_err(|e| Status::internal(format!("update failed: {e}")))?;

    Ok(to_proto(&updated))
}

pub(crate) async fn delete_quiz(
    repository: &QuizRepository,
    quiz_uuid: Uuid,
    requested_by: &str,
) -> Result<bool, Status> {
    let quiz = repository
        .find_by_id(quiz_uuid)
        .await
        .map_err(|e| Status::internal(format!("read failed: {e}")))?
        .ok_or_else(|| Status::not_found("quiz not found"))?;
    if quiz.owner_user_id.to_string() != requested_by {
        return Err(Status::permission_denied("only owner can delete quiz"));
    }

    repository
        .delete(quiz_uuid)
        .await
        .map_err(|e| Status::internal(format!("delete failed: {e}")))
}

pub(crate) async fn list_quizzes(
    repository: &QuizRepository,
    owner: Option<Uuid>,
    page_size: i64,
    offset: i64,
) -> Result<(Vec<proto::richcrab::v1::Quiz>, String), Status> {
    let quizzes = repository
        .list(owner, page_size, offset)
        .await
        .map_err(|e| Status::internal(format!("list failed: {e}")))?;
    let next_page_token = if quizzes.len() as i64 == page_size {
        (offset + page_size).to_string()
    } else {
        String::new()
    };

    Ok((quizzes.iter().map(to_proto).collect(), next_page_token))
}

pub(crate) async fn publish_quiz(
    repository: &QuizRepository,
    quiz_uuid: Uuid,
    requested_by: &str,
) -> Result<(proto::richcrab::v1::Quiz, u32), Status> {
    let quiz = repository
        .find_by_id(quiz_uuid)
        .await
        .map_err(|e| Status::internal(format!("read failed: {e}")))?
        .ok_or_else(|| Status::not_found("quiz not found"))?;
    if quiz.owner_user_id.to_string() != requested_by {
        return Err(Status::permission_denied("only owner can publish quiz"));
    }

    let next_version = quiz.published_version + 1;
    repository
        .publish_snapshot(&quiz, next_version)
        .await
        .map_err(|e| Status::internal(format!("publish failed: {e}")))?;

    let refreshed = repository
        .find_by_id(quiz_uuid)
        .await
        .map_err(|e| Status::internal(format!("read failed: {e}")))?
        .ok_or_else(|| Status::not_found("quiz not found"))?;

    Ok((to_proto(&refreshed), next_version as u32))
}
