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

pub(crate) struct StartAiQuizJobParams {
    pub requester_uuid: Uuid,
    pub prompt: String,
    pub desired_question_count: usize,
    pub difficulty: Option<String>,
    pub language: Option<String>,
    pub question_format: Option<String>,
}

struct AiQuizWorkerParams {
    job_id: Uuid,
    owner_user_id: Uuid,
    prompt: String,
    desired_question_count: usize,
    difficulty: Option<String>,
    language: Option<String>,
    question_format: Option<String>,
}

pub(crate) async fn start_ai_quiz_job(
    repository: &QuizRepository,
    ai_generator: Option<AiGeneratorConfig>,
    fallback_questions: Vec<proto::richcrab::v1::QuizQuestion>,
    params: StartAiQuizJobParams,
) -> Result<String, Status> {
    let now = Utc::now();
    let job = AiQuizJob {
        id: Uuid::new_v4(),
        owner_user_id: params.requester_uuid,
        prompt: params.prompt.clone(),
        desired_question_count: Some(params.desired_question_count as i32),
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

    spawn_ai_quiz_worker(
        repository.clone(),
        ai_generator,
        fallback_questions,
        AiQuizWorkerParams {
            job_id: job.id,
            owner_user_id: params.requester_uuid,
            prompt: params.prompt,
            desired_question_count: params.desired_question_count,
            difficulty: params.difficulty,
            language: params.language,
            question_format: params.question_format,
        },
    );

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

fn spawn_ai_quiz_worker(
    repository: QuizRepository,
    ai_generator: Option<AiGeneratorConfig>,
    fallback_questions: Vec<proto::richcrab::v1::QuizQuestion>,
    params: AiQuizWorkerParams,
) {
    tokio::spawn(async move {
        if let Err(err) = repository
            .set_ai_quiz_job_status(params.job_id, "running")
            .await
        {
            tracing::error!(?err, job_id = %params.job_id, "failed to mark ai job running");
            return;
        }

        sleep(Duration::from_millis(300)).await;

        let generated = match ai_generator {
            Some(cfg) => {
                match generate_quiz_via_model(
                    &cfg,
                    params.owner_user_id,
                    &params.prompt,
                    params.desired_question_count,
                    params.difficulty.as_deref(),
                    params.language.as_deref(),
                    params.question_format.as_deref(),
                )
                .await
                {
                    Ok(quiz) => quiz,
                    Err(err) => {
                        let _ = repository
                            .fail_ai_quiz_job(params.job_id, &format!("generation failed: {err}"))
                            .await;
                        return;
                    }
                }
            }
            None => {
                if fallback_questions.is_empty() {
                    let _ = repository
                        .fail_ai_quiz_job(
                            params.job_id,
                            "AI provider unavailable and fallback bank is empty",
                        )
                        .await;
                    return;
                }

                let selected = fallback_questions
                    .iter()
                    .take(params.desired_question_count.max(1))
                    .cloned()
                    .collect::<Vec<_>>();

                let now = Utc::now();
                proto::richcrab::v1::Quiz {
                    quiz_id: Some(proto::richcrab::v1::QuizId {
                        value: Uuid::new_v4().to_string(),
                    }),
                    owner_user_id: Some(proto::richcrab::v1::UserId {
                        value: params.owner_user_id.to_string(),
                    }),
                    title: format!("AI fallback: {}", params.prompt),
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

        let job_id = params.job_id;
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
