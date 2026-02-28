use std::sync::Arc;

use tonic::Status;

use crate::domain::GameQuestion;

#[tonic::async_trait]
pub trait QuizClient: Send + Sync {
    async fn load_quiz_questions(&self, quiz_id: &str) -> Result<Vec<GameQuestion>, Status>;
}

pub type DynQuizClient = Arc<dyn QuizClient>;

#[derive(Clone)]
pub struct GrpcQuizClient {
    inner: proto::richcrab::v1::quiz_service_client::QuizServiceClient<tonic::transport::Channel>,
}

impl GrpcQuizClient {
    pub fn new(
        inner: proto::richcrab::v1::quiz_service_client::QuizServiceClient<
            tonic::transport::Channel,
        >,
    ) -> Self {
        Self { inner }
    }
}

#[tonic::async_trait]
impl QuizClient for GrpcQuizClient {
    async fn load_quiz_questions(&self, quiz_id: &str) -> Result<Vec<GameQuestion>, Status> {
        let mut client = self.inner.clone();
        let response = client
            .get_quiz(proto::richcrab::v1::GetQuizRequest {
                quiz_id: Some(proto::richcrab::v1::QuizId {
                    value: quiz_id.to_string(),
                }),
            })
            .await
            .map_err(|e| Status::unavailable(format!("quiz unavailable: {e}")))?
            .into_inner();

        let quiz = response
            .quiz
            .ok_or_else(|| Status::not_found("quiz not found"))?;
        if quiz.questions.is_empty() {
            return Err(Status::failed_precondition("quiz has no questions"));
        }

        let mut questions = Vec::with_capacity(quiz.questions.len());
        for q in quiz.questions {
            if q.options.len() < 2 {
                return Err(Status::failed_precondition(format!(
                    "quiz question {} has less than 2 options",
                    q.id
                )));
            }
            if let Some(correct_idx) = q.correct_option_index {
                if (correct_idx as usize) >= q.options.len() {
                    return Err(Status::failed_precondition(format!(
                        "quiz question {} has invalid correct option index",
                        q.id
                    )));
                }
            }
            questions.push(GameQuestion {
                question_id: q.id,
                question_text: q.text,
                options: q.options,
                correct_option_index: q.correct_option_index,
            });
        }

        Ok(questions)
    }
}
