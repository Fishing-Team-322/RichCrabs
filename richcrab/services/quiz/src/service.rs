use shared::entitlements_client::EntitlementsApi;
use sqlx::PgPool;
use tonic::{Request, Response, Status};
use uuid::Uuid;

use crate::{
    application::{ai_jobs, crud},
    config::ai::{load_ai_generator_config_from_env, AiGeneratorConfig},
    infrastructure::fallback_bank::load_fallback_question_bank,
    repository::QuizRepository,
};

pub struct QuizServiceImpl {
    repository: QuizRepository,
    fallback_questions: Vec<proto::richcrab::v1::QuizQuestion>,
    entitlements: shared::entitlements_client::SharedEntitlementsClient,
    ai_generator: Option<AiGeneratorConfig>,
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
            fallback_questions: load_fallback_question_bank().unwrap_or_default(),
            entitlements: shared::entitlements_client::SharedEntitlementsClient::new(entitlements),
            ai_generator: load_ai_generator_config_from_env(),
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
        let owner_uuid = Uuid::parse_str(&owner_user_id)
            .map_err(|_| Status::invalid_argument("owner_user_id must be uuid"))?;

        self.entitlements
            .for_user(&owner_user_id)
            .check("CREATE_QUIZ")
            .await
            .map_err(Status::from)?;

        let questions = if req.questions.is_empty() {
            self.fallback_questions.clone()
        } else {
            req.questions
        };
        let quiz = crud::create_quiz(
            &self.repository,
            owner_uuid,
            req.title,
            req.description,
            questions,
        )
        .await?;
        self.entitlements
            .for_user(&owner_user_id)
            .report("CREATE_QUIZ", 1)
            .await
            .map_err(Status::from)?;

        Ok(Response::new(proto::richcrab::v1::CreateQuizResponse {
            quiz: Some(quiz),
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

        let quiz = crud::get_quiz(&self.repository, quiz_uuid).await?;
        Ok(Response::new(proto::richcrab::v1::GetQuizResponse {
            quiz: Some(quiz),
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
                quiz: Some(crate::mappers::to_proto(&published)),
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

        let updated = crud::update_quiz(&self.repository, quiz).await?;
        Ok(Response::new(proto::richcrab::v1::UpdateQuizResponse {
            quiz: Some(updated),
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
        let deleted = crud::delete_quiz(&self.repository, quiz_uuid, &requested_by).await?;

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

        let (quizzes, next_page_token) =
            crud::list_quizzes(&self.repository, owner, page_size, offset).await?;

        Ok(Response::new(proto::richcrab::v1::ListQuizzesResponse {
            quizzes,
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

        let (quiz, published_version) =
            crud::publish_quiz(&self.repository, quiz_uuid, &requested_by).await?;
        Ok(Response::new(proto::richcrab::v1::PublishQuizResponse {
            quiz: Some(quiz),
            published_version,
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
        self.entitlements
            .for_user(&requester)
            .check("AI_GENERATE")
            .await
            .map_err(Status::from)?;
        self.entitlements
            .for_user(&requester)
            .report("AI_GENERATE", 1)
            .await
            .map_err(Status::from)?;

        let requester_uuid = Uuid::parse_str(&requester)
            .map_err(|_| Status::invalid_argument("requested_by must be uuid"))?;
        let desired_question_count = req.desired_question_count.unwrap_or(5).clamp(1, 20) as usize;
        let difficulty = req
            .difficulty
            .map(|v| v.trim().to_string())
            .filter(|v| !v.is_empty());
        let language = req
            .language
            .map(|v| v.trim().to_string())
            .filter(|v| !v.is_empty());
        let question_format = req
            .format
            .map(|v| v.trim().to_string())
            .filter(|v| !v.is_empty());
        let prompt = req.prompt.trim().to_string();
        if prompt.is_empty() {
            return Err(Status::invalid_argument("prompt is required"));
        }

        let job_id = ai_jobs::start_ai_quiz_job(
            &self.repository,
            self.ai_generator.clone(),
            self.fallback_questions.clone(),
            ai_jobs::AiQuizJobRequest {
                requester_uuid,
                prompt,
                desired_question_count,
                difficulty,
                language,
                question_format,
            },
        )
        .await?;

        Ok(Response::new(proto::richcrab::v1::StartAiQuizJobResponse {
            job_id,
            status: "queued".to_string(),
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
        let job_id = req.job_id;
        let job_uuid = Uuid::parse_str(&job_id)
            .map_err(|_| Status::invalid_argument("job_id must be uuid"))?;

        let response = ai_jobs::get_ai_quiz_job(&self.repository, &requested_by, job_uuid).await?;
        Ok(Response::new(response))
    }
}

#[cfg(test)]
mod tests {
    use std::{env, sync::Arc};

    use sqlx::postgres::PgPoolOptions;
    use tokio::sync::oneshot;
    use tokio_stream::wrappers::TcpListenerStream;
    use tonic::transport::Server;
    use uuid::Uuid;

    use crate::{
        application::ai_jobs,
        config::ai::AiGeneratorConfig,
        repository::{AiQuizJob, QuizRepository},
    };

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

    #[tokio::test]
    async fn ai_job_lifecycle_integration() {
        let database_url = match env::var(shared::config::DATABASE_URL) {
            Ok(v) => v,
            Err(_) => return,
        };
        let pool = PgPoolOptions::new()
            .max_connections(2)
            .connect(&database_url)
            .await
            .expect("db");
        let migrations_dir = env::var(shared::config::MIGRATIONS_DIR)
            .unwrap_or_else(|_| format!("{}/../../migrations", env!("CARGO_MANIFEST_DIR")));
        shared::db::run_migrations(&pool, &migrations_dir)
            .await
            .expect("migrations");

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

        let repo = QuizRepository::new(pool.clone());
        let owner = Uuid::new_v4();
        sqlx::query(
            "INSERT INTO users (id, telegram_user_id, display_name) VALUES ($1, $2, $3) ON CONFLICT (id) DO NOTHING",
        )
        .bind(owner)
        .bind(i64::MAX - 7)
        .bind("quiz-ai-job-test")
         .execute(&pool)
        .await
        .expect("seed owner user");

        let now = chrono::Utc::now();
        let job = AiQuizJob {
            id: Uuid::new_v4(),
            owner_user_id: owner,
            prompt: "topic".to_string(),
            desired_question_count: Some(1),
            status: "queued".to_string(),
            result_quiz_json: None,
            error_message: None,
            created_at: now,
            updated_at: now,
        };
        repo.create_ai_quiz_job(&job).await.expect("create job");

        ai_jobs::spawn_ai_quiz_worker(ai_jobs::AiQuizWorkerInput {
            repository: repo.clone(),
            ai_generator: Some(AiGeneratorConfig {
                addr: addr.to_string(),
                model: "GigaChat-Pro".to_string(),
                api_key: "test-key".to_string(),
                request_timeout_ms: 3_000,
                max_retries: 0,
            }),
            fallback_questions: vec![],
            job_id: job.id,
            request: ai_jobs::AiQuizJobRequest {
                requester_uuid: owner,
                prompt: "topic".to_string(),
                desired_question_count: 1,
                difficulty: None,
                language: None,
                question_format: None,
            },
        });

        tokio::time::sleep(std::time::Duration::from_millis(700)).await;
        let job_after = repo
            .find_ai_quiz_job_by_id(job.id)
            .await
            .expect("read job")
            .expect("exists");

        assert_eq!(job_after.status, "done");
        assert!(job_after.result_quiz_json.is_some());

        let _ = shutdown_tx.send(());
        server.await.expect("server join").expect("clean stop");
    }
}
