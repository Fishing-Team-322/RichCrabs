use std::{fs, path::PathBuf};

use anyhow::Context;
use chrono::Utc;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sqlx::PgPool;
use tonic::{Request, Response, Status};
use uuid::Uuid;

use crate::repository::{Quiz, QuizRepository};

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

pub struct QuizServiceImpl {
    repository: QuizRepository,
    fallback_questions: Vec<proto::richcrab::v1::QuizQuestion>,
    entitlements: proto::richcrab::v1::entitlements_service_client::EntitlementsServiceClient<
        tonic::transport::Channel,
    >,
}

impl QuizServiceImpl {
    pub fn new(
        pool: PgPool,
        entitlements: proto::richcrab::v1::entitlements_service_client::EntitlementsServiceClient<
            tonic::transport::Channel,
        >,
    ) -> Self {
        Self {
            repository: QuizRepository::new(pool),
            fallback_questions: Self::load_fallback_question_bank().unwrap_or_default(),
            entitlements,
        }
    }

    fn load_fallback_question_bank() -> anyhow::Result<Vec<proto::richcrab::v1::QuizQuestion>> {
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

    fn questions_to_json(questions: &[proto::richcrab::v1::QuizQuestion]) -> Value {
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

    fn questions_from_json(value: &Value) -> Vec<proto::richcrab::v1::QuizQuestion> {
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

    fn to_proto(quiz: &Quiz) -> proto::richcrab::v1::Quiz {
        let questions = Self::questions_from_json(&quiz.questions_json);

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

    async fn check_entitlement(&self, user_id: &str, feature: &str) -> Result<(), Status> {
        let mut client = self.entitlements.clone();
        let response = client
            .check_entitlement(proto::richcrab::v1::CheckEntitlementRequest {
                user_id: Some(proto::richcrab::v1::UserId {
                    value: user_id.to_string(),
                }),
                feature: feature.to_string(),
            })
            .await
            .map_err(|e| Status::unavailable(format!("entitlements unavailable: {e}")))?
            .into_inner();

        if response.allowed {
            Ok(())
        } else {
            Err(Status::permission_denied(response.reason))
        }
    }
}

#[tonic::async_trait]
impl proto::richcrab::v1::quiz_service_server::QuizService for QuizServiceImpl {
    async fn create_quiz(
        &self,
        request: Request<proto::richcrab::v1::CreateQuizRequest>,
    ) -> Result<Response<proto::richcrab::v1::CreateQuizResponse>, Status> {
        let req = request.into_inner();
        let owner_user_id = req
            .owner_user_id
            .map(|v| v.value)
            .ok_or_else(|| Status::invalid_argument("owner_user_id is required"))?;
        let owner_id = Uuid::parse_str(&owner_user_id)
            .map_err(|_| Status::invalid_argument("owner_user_id must be uuid"))?;
        let questions = if req.questions.is_empty() {
            self.fallback_questions.clone()
        } else {
            req.questions
        };

        let now = Utc::now();
        let quiz = Quiz {
            id: Uuid::new_v4(),
            owner_user_id: owner_id,
            title: req.title,
            description: req.description,
            status: "draft".to_string(),
            published_version: 0,
            questions_json: Self::questions_to_json(&questions),
            created_at: now,
            updated_at: now,
        };
        self.repository
            .create(&quiz)
            .await
            .map_err(|e| Status::internal(format!("create failed: {e}")))?;

        Ok(Response::new(proto::richcrab::v1::CreateQuizResponse {
            quiz: Some(Self::to_proto(&quiz)),
            error: None,
        }))
    }

    async fn get_quiz(
        &self,
        request: Request<proto::richcrab::v1::GetQuizRequest>,
    ) -> Result<Response<proto::richcrab::v1::GetQuizResponse>, Status> {
        let id = request
            .into_inner()
            .quiz_id
            .map(|v| v.value)
            .ok_or_else(|| Status::invalid_argument("quiz_id is required"))?;
        let quiz_id =
            Uuid::parse_str(&id).map_err(|_| Status::invalid_argument("quiz_id must be uuid"))?;
        let quiz = self
            .repository
            .find_by_id(quiz_id)
            .await
            .map_err(|e| Status::internal(format!("read failed: {e}")))?
            .ok_or_else(|| Status::not_found("quiz not found"))?;

        Ok(Response::new(proto::richcrab::v1::GetQuizResponse {
            quiz: Some(Self::to_proto(&quiz)),
            error: None,
        }))
    }

    async fn update_quiz(
        &self,
        request: Request<proto::richcrab::v1::UpdateQuizRequest>,
    ) -> Result<Response<proto::richcrab::v1::UpdateQuizResponse>, Status> {
        let req = request.into_inner();
        let quiz = req
            .quiz
            .ok_or_else(|| Status::invalid_argument("quiz payload is required"))?;
        let quiz_id = quiz
            .quiz_id
            .map(|v| v.value)
            .ok_or_else(|| Status::invalid_argument("quiz_id is required"))?;
        let quiz_id = Uuid::parse_str(&quiz_id)
            .map_err(|_| Status::invalid_argument("quiz_id must be uuid"))?;

        let existing = self
            .repository
            .find_by_id(quiz_id)
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
            questions_json: Self::questions_to_json(&quiz.questions),
            ..existing
        };
        self.repository
            .update(&updated)
            .await
            .map_err(|e| Status::internal(format!("update failed: {e}")))?;

        Ok(Response::new(proto::richcrab::v1::UpdateQuizResponse {
            quiz: Some(Self::to_proto(&updated)),
            error: None,
        }))
    }

    async fn delete_quiz(
        &self,
        _request: Request<proto::richcrab::v1::DeleteQuizRequest>,
    ) -> Result<Response<proto::richcrab::v1::DeleteQuizResponse>, Status> {
        Err(Status::unimplemented("delete_quiz is not implemented"))
    }

    async fn list_quizzes(
        &self,
        request: Request<proto::richcrab::v1::ListQuizzesRequest>,
    ) -> Result<Response<proto::richcrab::v1::ListQuizzesResponse>, Status> {
        let req = request.into_inner();
        let page_size = if req.page_size == 0 {
            20
        } else {
            req.page_size.min(100)
        } as i64;
        let offset = req.page_token.parse::<i64>().unwrap_or(0).max(0);
        let owner = req
            .owner_user_id
            .map(|id| Uuid::parse_str(&id.value))
            .transpose()
            .map_err(|_| Status::invalid_argument("owner_user_id must be uuid"))?;

        let quizzes = self
            .repository
            .list(owner, page_size, offset)
            .await
            .map_err(|e| Status::internal(format!("list failed: {e}")))?;
        let next_page_token = if quizzes.len() as i64 == page_size {
            (offset + page_size).to_string()
        } else {
            String::new()
        };

        Ok(Response::new(proto::richcrab::v1::ListQuizzesResponse {
            quizzes: quizzes.iter().map(Self::to_proto).collect(),
            next_page_token,
            error: None,
        }))
    }

    async fn publish_quiz(
        &self,
        request: Request<proto::richcrab::v1::PublishQuizRequest>,
    ) -> Result<Response<proto::richcrab::v1::PublishQuizResponse>, Status> {
        let req = request.into_inner();
        let quiz_id = req
            .quiz_id
            .map(|v| v.value)
            .ok_or_else(|| Status::invalid_argument("quiz_id is required"))?;
        let requested_by = req
            .requested_by
            .map(|v| v.value)
            .ok_or_else(|| Status::invalid_argument("requested_by is required"))?;
        let quiz_uuid = Uuid::parse_str(&quiz_id)
            .map_err(|_| Status::invalid_argument("quiz_id must be uuid"))?;
        let quiz = self
            .repository
            .find_by_id(quiz_uuid)
            .await
            .map_err(|e| Status::internal(format!("read failed: {e}")))?
            .ok_or_else(|| Status::not_found("quiz not found"))?;
        if quiz.owner_user_id.to_string() != requested_by {
            return Err(Status::permission_denied("only owner can publish quiz"));
        }
        let next_version = quiz.published_version + 1;
        self.repository
            .publish_snapshot(&quiz, next_version)
            .await
            .map_err(|e| Status::internal(format!("publish failed: {e}")))?;

        let refreshed = self
            .repository
            .find_by_id(quiz_uuid)
            .await
            .map_err(|e| Status::internal(format!("read failed: {e}")))?
            .ok_or_else(|| Status::not_found("quiz not found"))?;

        Ok(Response::new(proto::richcrab::v1::PublishQuizResponse {
            quiz: Some(Self::to_proto(&refreshed)),
            published_version: next_version as u32,
            error: None,
        }))
    }

    async fn start_ai_quiz_job(
        &self,
        request: Request<proto::richcrab::v1::StartAiQuizJobRequest>,
    ) -> Result<Response<proto::richcrab::v1::StartAiQuizJobResponse>, Status> {
        let req = request.into_inner();
        let requester = req
            .requested_by
            .map(|v| v.value)
            .ok_or_else(|| Status::invalid_argument("requested_by is required"))?;
        self.check_entitlement(&requester, "AI_GENERATE").await?;
        Ok(Response::new(proto::richcrab::v1::StartAiQuizJobResponse {
            job_id: Uuid::new_v4().to_string(),
            status: "accepted".to_string(),
            error: None,
        }))
    }

    async fn get_ai_quiz_job(
        &self,
        request: Request<proto::richcrab::v1::GetAiQuizJobRequest>,
    ) -> Result<Response<proto::richcrab::v1::GetAiQuizJobResponse>, Status> {
        Ok(Response::new(proto::richcrab::v1::GetAiQuizJobResponse {
            job_id: request.into_inner().job_id,
            status: "not_implemented".to_string(),
            quiz: None,
            error: None,
        }))
    }
}
