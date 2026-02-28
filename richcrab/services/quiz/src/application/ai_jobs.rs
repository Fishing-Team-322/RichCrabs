use chrono::Utc;
use tokio::time::{sleep, Duration};
use tonic::Status;
use uuid::Uuid;

use crate::{
    application::validation::validate_questions,
    config::ai::AiGeneratorConfig,
    infrastructure::ai_provider::generate_quiz_via_model,
    mappers::{quiz_from_json, quiz_to_json},
    repository::{AiQuizJob, QuizRepository},
};

#[derive(Clone)]
pub(crate) struct AiQuizJobRequest {
    pub(crate) requester_uuid: Uuid,
    pub(crate) prompt: String,
    pub(crate) desired_question_count: usize,
    pub(crate) difficulty: Option<String>,
    pub(crate) language: Option<String>,
    pub(crate) question_format: Option<String>,
}

pub(crate) struct AiQuizWorkerInput {
    pub(crate) repository: QuizRepository,
    pub(crate) ai_generator: Option<AiGeneratorConfig>,
    pub(crate) fallback_questions: Vec<proto::richcrab::v1::QuizQuestion>,
    pub(crate) job_id: Uuid,
    pub(crate) request: AiQuizJobRequest,
}

pub(crate) async fn start_ai_quiz_job(
    repository: &QuizRepository,
    ai_generator: Option<AiGeneratorConfig>,
    fallback_questions: Vec<proto::richcrab::v1::QuizQuestion>,
    request: AiQuizJobRequest,
) -> Result<String, Status> {
    let now = Utc::now();
    let job = AiQuizJob {
        id: Uuid::new_v4(),
        owner_user_id: request.requester_uuid,
        prompt: request.prompt.clone(),
        desired_question_count: Some(request.desired_question_count as i32),
        status: "queued".to_string(),
        result_quiz_json: None,
        error_message: None,
        created_at: now,
        updated_at: now,
    };

    repository
        .create_ai_quiz_job(&job)
        .await
        .map_err(|e| Status::internal(format!("failed to create ai job: {e}")))?;

    spawn_ai_quiz_worker(AiQuizWorkerInput {
        repository: repository.clone(),
        ai_generator,
        fallback_questions,
        job_id: job.id,
        request,
    });

    Ok(job.id.to_string())
}

pub(crate) async fn get_ai_quiz_job(
    repository: &QuizRepository,
    requested_by: &str,
    job_uuid: Uuid,
) -> Result<proto::richcrab::v1::GetAiQuizJobResponse, Status> {
    let job = repository
        .find_ai_quiz_job_by_id(job_uuid)
        .await
        .map_err(|e| Status::internal(format!("failed to fetch ai quiz job: {e}")))?
        .ok_or_else(|| Status::not_found("ai quiz job not found"))?;
    if job.owner_user_id.to_string() != requested_by {
        return Err(Status::permission_denied(
            "only job owner can read ai job status",
        ));
    }

    let quiz = job.result_quiz_json.as_ref().and_then(quiz_from_json);
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

    Ok(proto::richcrab::v1::GetAiQuizJobResponse {
        job_id: job.id.to_string(),
        status: job.status,
        quiz,
        error,
    })
}

pub(crate) fn spawn_ai_quiz_worker(input: AiQuizWorkerInput) {
    tokio::spawn(async move {
        let AiQuizWorkerInput {
            repository,
            ai_generator,
            fallback_questions,
            job_id,
            request,
        } = input;

        if let Err(err) = repository.set_ai_quiz_job_status(job_id, "running").await {
            tracing::error!(?err, %job_id, "failed to mark ai job running");
            return;
        }

        sleep(Duration::from_millis(300)).await;

        let generated = match ai_generator {
            Some(cfg) => {
                match generate_quiz_via_model(
                    &cfg,
                    request.requester_uuid,
                    &request.prompt,
                    request.desired_question_count,
                    request.difficulty.as_deref(),
                    request.language.as_deref(),
                    request.question_format.as_deref(),
                )
                .await
                {
                    Ok(quiz) => quiz,
                    Err(err) => {
                        let _ = repository
                            .fail_ai_quiz_job(job_id, &format!("generation failed: {err}"))
                            .await;
                        return;
                    }
                }
            }
            None => {
                if fallback_questions.is_empty() {
                    let _ = repository
                        .fail_ai_quiz_job(
                            job_id,
                            "AI provider unavailable and fallback bank is empty",
                        )
                        .await;
                    return;
                }

                let selected = fallback_questions
                    .iter()
                    .take(request.desired_question_count.max(1))
                    .cloned()
                    .collect::<Vec<_>>();

                let now = Utc::now();
                proto::richcrab::v1::Quiz {
                    quiz_id: Some(proto::richcrab::v1::QuizId {
                        value: Uuid::new_v4().to_string(),
                    }),
                    owner_user_id: Some(proto::richcrab::v1::UserId {
                        value: request.requester_uuid.to_string(),
                    }),
                    title: format!("AI fallback: {}", request.prompt),
                    description: "Generated from local fallback bank".to_string(),
                    questions: selected,
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

        if let Err(err) = validate_questions(&generated.questions) {
            let _ = repository
                .fail_ai_quiz_job(job_id, &format!("generation failed validation: {err}"))
                .await;
            return;
        }

        let result_json = quiz_to_json(&generated);
        if let Err(err) = repository.complete_ai_quiz_job(job_id, result_json).await {
            let _ = repository
                .fail_ai_quiz_job(job_id, &format!("failed to persist generated quiz: {err}"))
                .await;
        }
    });
}
