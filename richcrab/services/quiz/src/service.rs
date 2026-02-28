use std::{env, fs, path::PathBuf};

use anyhow::{Context, Result};
use chrono::Utc;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sqlx::PgPool;
use tokio::time::{sleep, Duration};
use tonic::{metadata::MetadataValue, transport::Channel, Request, Response, Status};
use uuid::Uuid;

use crate::repository::{AiQuizJob, Quiz, QuizRepository};

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

#[derive(Debug, Clone)]
pub(crate) struct AiGeneratorConfig {
    addr: String,
    model: String,
    api_key: String,
}

#[derive(Debug, Deserialize)]
struct GeneratedQuizPayload {
    title: String,
    description: Option<String>,
    questions: Vec<GeneratedQuestionPayload>,
}

#[derive(Debug, Deserialize)]
struct GeneratedQuestionPayload {
    text: String,
    options: Vec<String>,
    correct_option_index: u32,
}

pub struct QuizServiceImpl {
    repository: QuizRepository,
    fallback_questions: Vec<proto::richcrab::v1::QuizQuestion>,
    entitlements:
        proto::richcrab::v1::entitlements_service_client::EntitlementsServiceClient<Channel>,
    ai_generator: Option<AiGeneratorConfig>,
}

impl QuizServiceImpl {
    pub fn new(
        pool: PgPool,
        entitlements: proto::richcrab::v1::entitlements_service_client::EntitlementsServiceClient<
            Channel,
        >,
    ) -> Self {
        Self {
            repository: QuizRepository::new(pool),
            fallback_questions: Self::load_fallback_question_bank().unwrap_or_default(),
            entitlements,
            ai_generator: Self::load_ai_generator_config_from_env(),
        }
    }

    fn load_ai_generator_config_from_env() -> Option<AiGeneratorConfig> {
        let addr = env::var(shared::config::GIGACHAT_API_ADDR).ok()?;
        let api_key = env::var(shared::config::GIGACHAT_API_KEY).ok()?;
        let model =
            env::var(shared::config::GIGACHAT_MODEL).unwrap_or_else(|_| "GigaChat-Pro".to_string());
        Some(AiGeneratorConfig {
            addr,
            model,
            api_key,
        })
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

    fn validate_questions(questions: &[proto::richcrab::v1::QuizQuestion]) -> Result<(), String> {
        if questions.is_empty() {
            return Err("quiz must contain at least one question".to_string());
        }

        for (idx, q) in questions.iter().enumerate() {
            if q.text.trim().is_empty() {
                return Err(format!("question[{idx}] text must not be empty"));
            }
            if q.options.len() < 2 {
                return Err(format!("question[{idx}] must contain at least two options"));
            }
            for (opt_idx, option) in q.options.iter().enumerate() {
                if option.trim().is_empty() {
                    return Err(format!(
                        "question[{idx}] option[{opt_idx}] must not be empty"
                    ));
                }
            }
            if let Some(correct_idx) = q.correct_option_index {
                if (correct_idx as usize) >= q.options.len() {
                    return Err(format!("question[{idx}] has invalid correct_option_index"));
                }
            }
        }

        Ok(())
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

    async fn report_usage(&self, user_id: &str, feature: &str) -> Result<(), Status> {
        let mut client = self.entitlements.clone();
        client
            .report_usage(proto::richcrab::v1::ReportUsageRequest {
                user_id: Some(proto::richcrab::v1::UserId {
                    value: user_id.to_string(),
                }),
                feature: feature.to_string(),
                units: 1,
            })
            .await
            .map_err(|e| Status::unavailable(format!("usage reporting failed: {e}")))?;
        Ok(())
    }

    fn quiz_to_json(quiz: &proto::richcrab::v1::Quiz) -> Value {
        json!({
            "quiz_id": quiz.quiz_id.as_ref().map(|v| v.value.clone()).unwrap_or_default(),
            "owner_user_id": quiz.owner_user_id.as_ref().map(|v| v.value.clone()).unwrap_or_default(),
            "title": quiz.title,
            "description": quiz.description,
            "questions": Self::questions_to_json(&quiz.questions),
            "created_at": quiz.created_at.as_ref().map(|ts| ts.seconds).unwrap_or_default(),
            "updated_at": quiz.updated_at.as_ref().map(|ts| ts.seconds).unwrap_or_default(),
        })
    }

    fn quiz_from_json(value: &Value) -> Option<proto::richcrab::v1::Quiz> {
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
            questions: Self::questions_from_json(value.get("questions").unwrap_or(&Value::Null)),
            created_at: None,
            updated_at: None,
        })
    }

    fn strip_markdown_code_fence(raw: &str) -> &str {
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

    fn build_quiz_from_generated_payload(
        owner_user_id: Uuid,
        parsed: GeneratedQuizPayload,
    ) -> Result<proto::richcrab::v1::Quiz> {
        let questions = parsed
            .questions
            .into_iter()
            .enumerate()
            .map(|(idx, q)| proto::richcrab::v1::QuizQuestion {
                id: format!("ai-{}", idx + 1),
                text: q.text,
                options: q.options,
                correct_option_index: Some(q.correct_option_index),
            })
            .collect::<Vec<_>>();

        Self::validate_questions(&questions).map_err(anyhow::Error::msg)?;

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

    fn parse_generated_quiz_content(
        owner_user_id: Uuid,
        raw_content: &str,
    ) -> Result<proto::richcrab::v1::Quiz> {
        let parsed: GeneratedQuizPayload =
            serde_json::from_str(Self::strip_markdown_code_fence(raw_content))?;
        Self::build_quiz_from_generated_payload(owner_user_id, parsed)
    }

    async fn generate_quiz_via_model(
        cfg: &AiGeneratorConfig,
        owner_user_id: Uuid,
        prompt: &str,
        desired_question_count: usize,
    ) -> Result<proto::richcrab::v1::Quiz> {
        let mut client = proto::gigachat::v1::chat_service_client::ChatServiceClient::connect(
            format!("http://{}", cfg.addr),
        )
        .await?;

        let user_prompt = format!(
            "Сгенерируй квиз на тему: {prompt}. Нужны {desired_question_count} вопросов. Верни только JSON в формате {{\"title\":string,\"description\":string,\"questions\":[{{\"text\":string,\"options\":[string,string,string,string],\"correct_option_index\":0..3}}]}}"
        );

        let req = proto::gigachat::v1::ChatRequest {
            options: Some(proto::gigachat::v1::ChatOptions {
                temperature: 0.6,
                top_p: 0.9,
                max_alternatives: 1,
                max_tokens: 1200,
                repetition_penalty: 1.0,
                update_interval: 0.0,
                flags: vec![],
            }),
            model: cfg.model.clone(),
            messages: vec![
                proto::gigachat::v1::Message {
                    role: "system".to_string(),
                    content: "Ты генерируешь валидные квизы с вариантами и правильным ответом."
                        .to_string(),
                    unprocessed_content: String::new(),
                },
                proto::gigachat::v1::Message {
                    role: "user".to_string(),
                    content: user_prompt,
                    unprocessed_content: String::new(),
                },
            ],
        };

        let mut grpc_req = Request::new(req);
        let auth = MetadataValue::try_from(format!("Bearer {}", cfg.api_key))?;
        grpc_req.metadata_mut().insert("authorization", auth);

        let response = client.chat(grpc_req).await?.into_inner();
        let content = response
            .alternatives
            .first()
            .and_then(|alt| alt.message.as_ref())
            .map(|m| m.content.clone())
            .ok_or_else(|| anyhow::anyhow!("model returned empty response"))?;

        Self::parse_generated_quiz_content(owner_user_id, &content)
    }

    fn spawn_ai_quiz_worker(
        repository: QuizRepository,
        ai_generator: Option<AiGeneratorConfig>,
        fallback_questions: Vec<proto::richcrab::v1::QuizQuestion>,
        job_id: Uuid,
        owner_user_id: Uuid,
        prompt: String,
        desired_question_count: usize,
    ) {
        tokio::spawn(async move {
            if let Err(err) = repository.set_ai_quiz_job_status(job_id, "running").await {
                tracing::error!(?err, %job_id, "failed to mark ai job running");
                return;
            }

            sleep(Duration::from_millis(300)).await;

            let generated = match ai_generator {
                Some(cfg) => match Self::generate_quiz_via_model(
                    &cfg,
                    owner_user_id,
                    &prompt,
                    desired_question_count,
                )
                .await
                {
                    Ok(quiz) => quiz,
                    Err(err) => {
                        let _ = repository
                            .fail_ai_quiz_job(job_id, &format!("model generation failed: {err}"))
                            .await;
                        return;
                    }
                },
                None => {
                    let questions = if fallback_questions.is_empty() {
                        vec![]
                    } else {
                        fallback_questions
                            .into_iter()
                            .take(desired_question_count)
                            .collect()
                    };
                    let now = Utc::now();
                    proto::richcrab::v1::Quiz {
                        quiz_id: Some(proto::richcrab::v1::QuizId {
                            value: Uuid::new_v4().to_string(),
                        }),
                        owner_user_id: Some(proto::richcrab::v1::UserId {
                            value: owner_user_id.to_string(),
                        }),
                        title: format!("AI Quiz: {}", prompt.trim()),
                        description: "AI model is not configured, fallback quiz generated"
                            .to_string(),
                        questions,
                        created_at: Some(prost_types::Timestamp {
                            seconds: now.timestamp(),
                            nanos: now.timestamp_subsec_nanos() as i32,
                        }),
                        updated_at: Some(prost_types::Timestamp {
                            seconds: now.timestamp(),
                            nanos: now.timestamp_subsec_nanos() as i32,
                        }),
                    }
                }
            };

            if let Err(err) = Self::validate_questions(&generated.questions) {
                let _ = repository
                    .fail_ai_quiz_job(job_id, &format!("generation failed validation: {err}"))
                    .await;
                return;
            }

            let result_json = Self::quiz_to_json(&generated);
            if let Err(err) = repository.complete_ai_quiz_job(job_id, result_json).await {
                let _ = repository
                    .fail_ai_quiz_job(job_id, &format!("failed to persist generated quiz: {err}"))
                    .await;
            }
        });
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
        let owner_uuid = Uuid::parse_str(&owner_user_id)
            .map_err(|_| Status::invalid_argument("owner_user_id must be uuid"))?;

        self.check_entitlement(&owner_user_id, "CREATE_QUIZ")
            .await?;

        let mut questions = req.questions;
        if questions.is_empty() {
            questions = self.fallback_questions.clone();
        }
        Self::validate_questions(&questions).map_err(Status::invalid_argument)?;

        let now = Utc::now();
        let quiz = Quiz {
            id: Uuid::new_v4(),
            owner_user_id: owner_uuid,
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
        self.report_usage(&owner_user_id, "CREATE_QUIZ").await?;

        Ok(Response::new(proto::richcrab::v1::CreateQuizResponse {
            quiz: Some(Self::to_proto(&quiz)),
            error: None,
        }))
    }

    async fn get_quiz(
        &self,
        request: Request<proto::richcrab::v1::GetQuizRequest>,
    ) -> Result<Response<proto::richcrab::v1::GetQuizResponse>, Status> {
        let quiz_id = request
            .into_inner()
            .quiz_id
            .map(|v| v.value)
            .ok_or_else(|| Status::invalid_argument("quiz_id is required"))?;
        let quiz_uuid = Uuid::parse_str(&quiz_id)
            .map_err(|_| Status::invalid_argument("quiz_id must be uuid"))?;

        let quiz = self
            .repository
            .find_by_id(quiz_uuid)
            .await
            .map_err(|e| Status::internal(format!("read failed: {e}")))?
            .ok_or_else(|| Status::not_found("quiz not found"))?;

        Ok(Response::new(proto::richcrab::v1::GetQuizResponse {
            quiz: Some(Self::to_proto(&quiz)),
            error: None,
        }))
    }

    async fn get_published_quiz(
        &self,
        request: Request<proto::richcrab::v1::GetPublishedQuizRequest>,
    ) -> Result<Response<proto::richcrab::v1::GetPublishedQuizResponse>, Status> {
        let req = request.into_inner();
        let quiz_id = req
            .quiz_id
            .map(|v| v.value)
            .ok_or_else(|| Status::invalid_argument("quiz_id is required"))?;
        let quiz_uuid = Uuid::parse_str(&quiz_id)
            .map_err(|_| Status::invalid_argument("quiz_id must be uuid"))?;

        let published = self
            .repository
            .find_published(quiz_uuid, req.version.map(|v| v as i32))
            .await
            .map_err(|e| Status::internal(format!("read failed: {e}")))?
            .ok_or_else(|| Status::not_found("published quiz version not found"))?;

        Ok(Response::new(
            proto::richcrab::v1::GetPublishedQuizResponse {
                quiz: Some(Self::to_proto(&published)),
                published_version: published.published_version as u32,
                error: None,
            },
        ))
    }

    async fn update_quiz(
        &self,
        request: Request<proto::richcrab::v1::UpdateQuizRequest>,
    ) -> Result<Response<proto::richcrab::v1::UpdateQuizResponse>, Status> {
        let quiz = request
            .into_inner()
            .quiz
            .ok_or_else(|| Status::invalid_argument("quiz is required"))?;
        let id = quiz
            .quiz_id
            .map(|v| v.value)
            .ok_or_else(|| Status::invalid_argument("quiz.quiz_id is required"))?;
        let parsed_id =
            Uuid::parse_str(&id).map_err(|_| Status::invalid_argument("quiz_id must be uuid"))?;

        Self::validate_questions(&quiz.questions).map_err(Status::invalid_argument)?;

        let existing = self
            .repository
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
        request: Request<proto::richcrab::v1::DeleteQuizRequest>,
    ) -> Result<Response<proto::richcrab::v1::DeleteQuizResponse>, Status> {
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
            return Err(Status::permission_denied("only owner can delete quiz"));
        }

        let deleted = self
            .repository
            .delete(quiz_uuid)
            .await
            .map_err(|e| Status::internal(format!("delete failed: {e}")))?;

        Ok(Response::new(proto::richcrab::v1::DeleteQuizResponse {
            deleted,
            error: None,
        }))
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
        self.report_usage(&requester, "AI_GENERATE").await?;

        let requester_uuid = Uuid::parse_str(&requester)
            .map_err(|_| Status::invalid_argument("requested_by must be uuid"))?;
        let desired_question_count = req.desired_question_count.unwrap_or(5).clamp(1, 20) as usize;
        let prompt = req.prompt.trim().to_string();
        if prompt.is_empty() {
            return Err(Status::invalid_argument("prompt is required"));
        }

        let now = Utc::now();
        let job = AiQuizJob {
            id: Uuid::new_v4(),
            owner_user_id: requester_uuid,
            prompt: prompt.clone(),
            desired_question_count: Some(desired_question_count as i32),
            status: "queued".to_string(),
            result_quiz_json: None,
            error_message: None,
            created_at: now,
            updated_at: now,
        };

        self.repository
            .create_ai_quiz_job(&job)
            .await
            .map_err(|e| Status::internal(format!("failed to create ai job: {e}")))?;

        Self::spawn_ai_quiz_worker(
            self.repository.clone(),
            self.ai_generator.clone(),
            self.fallback_questions.clone(),
            job.id,
            requester_uuid,
            prompt,
            desired_question_count,
        );

        Ok(Response::new(proto::richcrab::v1::StartAiQuizJobResponse {
            job_id: job.id.to_string(),
            status: job.status,
            error: None,
        }))
    }

    async fn get_ai_quiz_job(
        &self,
        request: Request<proto::richcrab::v1::GetAiQuizJobRequest>,
    ) -> Result<Response<proto::richcrab::v1::GetAiQuizJobResponse>, Status> {
        let req = request.into_inner();
        let requested_by = req
            .requested_by
            .map(|v| v.value)
            .ok_or_else(|| Status::invalid_argument("requested_by is required"))?;
        let job_uuid = Uuid::parse_str(&req.job_id)
            .map_err(|_| Status::invalid_argument("job_id must be uuid"))?;

        let job = self
            .repository
            .find_ai_quiz_job_by_id(job_uuid)
            .await
            .map_err(|e| Status::internal(format!("failed to read ai job: {e}")))?
            .ok_or_else(|| Status::not_found("ai quiz job not found"))?;
        if job.owner_user_id.to_string() != requested_by {
            return Err(Status::permission_denied(
                "only job owner can read ai job status",
            ));
        }

        let quiz = job.result_quiz_json.as_ref().and_then(Self::quiz_from_json);
        let error = job.error_message.map(|message| proto::richcrab::v1::Error {
            code: "FAILED_PRECONDITION".to_string(),
            message,
            details: Default::default(),
            occurred_at: Some(prost_types::Timestamp {
                seconds: Utc::now().timestamp(),
                nanos: Utc::now().timestamp_subsec_nanos() as i32,
            }),
            retry_after: None,
        });

        Ok(Response::new(proto::richcrab::v1::GetAiQuizJobResponse {
            job_id: job.id.to_string(),
            status: job.status,
            quiz,
            error,
        }))
    }
}

#[cfg(test)]
mod tests {
    use super::{AiGeneratorConfig, QuizServiceImpl};
    use std::sync::Arc;
    use tokio::sync::oneshot;
    use tokio_stream::wrappers::TcpListenerStream;
    use tonic::transport::Server;
    use uuid::Uuid;

    fn q(text: &str, options: &[&str], correct: Option<u32>) -> proto::richcrab::v1::QuizQuestion {
        proto::richcrab::v1::QuizQuestion {
            id: "q1".to_string(),
            text: text.to_string(),
            options: options.iter().map(|s| s.to_string()).collect(),
            correct_option_index: correct,
        }
    }

    #[derive(Clone)]
    struct FakeChatService {
        payload: Arc<String>,
    }

    #[tonic::async_trait]
    impl proto::gigachat::v1::chat_service_server::ChatService for FakeChatService {
        async fn chat(
            &self,
            _request: tonic::Request<proto::gigachat::v1::ChatRequest>,
        ) -> Result<tonic::Response<proto::gigachat::v1::ChatResponse>, tonic::Status> {
            Ok(tonic::Response::new(proto::gigachat::v1::ChatResponse {
                alternatives: vec![proto::gigachat::v1::Alternative {
                    message: Some(proto::gigachat::v1::Message {
                        role: "assistant".to_string(),
                        content: (*self.payload).clone(),
                        unprocessed_content: String::new(),
                    }),
                    finish_reason: "stop".to_string(),
                    index: 0,
                }],
                usage: None,
                model_info: None,
                timestamp: 0,
            }))
        }

        type ChatStreamStream = tokio_stream::wrappers::ReceiverStream<
            Result<proto::gigachat::v1::ChatResponse, tonic::Status>,
        >;

        async fn chat_stream(
            &self,
            _request: tonic::Request<proto::gigachat::v1::ChatRequest>,
        ) -> Result<tonic::Response<Self::ChatStreamStream>, tonic::Status> {
            Err(tonic::Status::unimplemented(
                "streaming is not used in tests",
            ))
        }
    }

    #[test]
    fn validate_questions_rejects_empty_list() {
        let result = QuizServiceImpl::validate_questions(&[]);
        assert!(result.is_err());
    }

    #[test]
    fn validate_questions_rejects_too_few_options() {
        let result = QuizServiceImpl::validate_questions(&[q("Q", &["only"], Some(0))]);
        assert!(result.is_err());
    }

    #[test]
    fn validate_questions_rejects_invalid_correct_index() {
        let result = QuizServiceImpl::validate_questions(&[q("Q", &["a", "b"], Some(2))]);
        assert!(result.is_err());
    }

    #[test]
    fn validate_questions_accepts_valid_payload() {
        let result = QuizServiceImpl::validate_questions(&[q("Q", &["a", "b"], Some(1))]);
        assert!(result.is_ok());
    }

    #[test]
    fn strip_markdown_code_fence_extracts_json() {
        let raw = "```json\n{\"title\":\"T\"}\n```";
        assert_eq!(
            QuizServiceImpl::strip_markdown_code_fence(raw),
            "{\"title\":\"T\"}"
        );
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

        let quiz = QuizServiceImpl::parse_generated_quiz_content(owner, raw)
            .expect("generated quiz must parse");

        assert_eq!(quiz.title, "Rust Quiz");
        assert_eq!(quiz.questions.len(), 1);
        assert_eq!(quiz.questions[0].correct_option_index, Some(2));
    }

    #[tokio::test]
    async fn generate_quiz_via_model_works_against_grpc_server() {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0")
            .await
            .expect("bind grpc port");
        let addr = listener.local_addr().expect("local addr");
        let payload = Arc::new(
            "```json\n{\"title\":\"AI Test\",\"questions\":[{\"text\":\"Q\",\"options\":[\"A\",\"B\"],\"correct_option_index\":1}]}\n```"
                .to_string(),
        );

        let svc = FakeChatService { payload };
        let (shutdown_tx, shutdown_rx) = oneshot::channel::<()>();
        let server = tokio::spawn(async move {
            Server::builder()
                .add_service(proto::gigachat::v1::chat_service_server::ChatServiceServer::new(svc))
                .serve_with_incoming_shutdown(TcpListenerStream::new(listener), async {
                    let _ = shutdown_rx.await;
                })
                .await
        });

        let cfg = AiGeneratorConfig {
            addr: addr.to_string(),
            model: "GigaChat-Pro".to_string(),
            api_key: "test-key".to_string(),
        };

        let quiz = QuizServiceImpl::generate_quiz_via_model(&cfg, Uuid::new_v4(), "topic", 1)
            .await
            .expect("quiz generated");

        assert_eq!(quiz.title, "AI Test");
        assert_eq!(quiz.questions.len(), 1);
        assert_eq!(quiz.questions[0].correct_option_index, Some(1));

        let _ = shutdown_tx.send(());
        server
            .await
            .expect("server join")
            .expect("server clean stop");
    }
}
