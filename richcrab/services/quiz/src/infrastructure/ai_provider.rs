use anyhow::{anyhow, Result};
use tokio::time::{timeout, Duration};
use tonic::{metadata::MetadataValue, Request};
use uuid::Uuid;

use crate::{application::validation::parse_generated_quiz_content, config::ai::AiGeneratorConfig};

pub(crate) async fn generate_quiz_via_model(
    cfg: &AiGeneratorConfig,
    owner_user_id: Uuid,
    prompt: &str,
    desired_question_count: usize,
) -> Result<proto::richcrab::v1::Quiz> {
    let mut attempts = 0;
    let mut last_err = None;

    while attempts <= cfg.max_retries {
        attempts += 1;
        let one_try = async {
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
                .ok_or_else(|| anyhow!("model returned empty response"))?;

            parse_generated_quiz_content(owner_user_id, &content)
        };

        match timeout(Duration::from_millis(cfg.request_timeout_ms), one_try).await {
            Ok(Ok(quiz)) => return Ok(quiz),
            Ok(Err(err)) => last_err = Some(err),
            Err(_) => last_err = Some(anyhow!("ai provider timed out")),
        }
    }

    Err(last_err.unwrap_or_else(|| anyhow!("ai provider request failed")))
}
