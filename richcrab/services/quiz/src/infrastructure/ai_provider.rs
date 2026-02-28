use anyhow::{anyhow, Result};
use tokio::time::{timeout, Duration};
use tonic::{metadata::MetadataValue, Request};
use uuid::Uuid;

use crate::{application::validation::parse_generated_quiz_content, config::ai::AiGeneratorConfig};

const SYSTEM_PROMPT_QUIZ_GENERATION: &str = r#"Ты генерируешь квизы и возвращаешь только валидный JSON без markdown, пояснений и дополнительных полей.

Жёсткие ограничения:
1) Формат ответа строго:
{"title":string,"description":string,"questions":[{"text":string,"options":[string,string,string,string],"correct_option_index":0..3}]}
2) Для каждого вопроса ровно 4 варианта ответа.
3) Для каждого вопроса ровно 1 правильный ответ (одно целое поле correct_option_index).
4) Длина question.text <= 160 символов.
5) Длина каждого элемента options <= 160 символов.
6) Пустые строки запрещены для title, description, question.text и options.
7) Дубликаты в options одного вопроса запрещены.

Если какой-либо пункт нарушается, перегенерируй JSON полностью внутри этого же ответа до полного соответствия. Не пиши объяснения или комментарии — только итоговый валидный JSON."#;

const USER_PROMPT_TEMPLATE: &str = r#"Сгенерируй квиз по параметрам из UI:
- Тема: {theme}
- Язык: {language}
- Сложность: {difficulty}
- Формат вопроса: {question_format} (single = один правильный, multi = несколько правильных)
- Желаемое число вопросов: {desired_question_count}

Важно: несмотря на формат question_format, в JSON каждого вопроса используй ровно один correct_option_index (индекс 0..3), потому что контракт ответа это single-choice."#;

fn build_user_prompt(
    prompt: &str,
    desired_question_count: usize,
    difficulty: Option<&str>,
    language: Option<&str>,
    question_format: Option<&str>,
) -> String {
    USER_PROMPT_TEMPLATE
        .replace("{theme}", prompt.trim())
        .replace("{language}", language.unwrap_or("русский"))
        .replace("{difficulty}", difficulty.unwrap_or("medium"))
        .replace("{question_format}", question_format.unwrap_or("single"))
        .replace(
            "{desired_question_count}",
            &desired_question_count.to_string(),
        )
}

pub(crate) async fn generate_quiz_via_model(
    cfg: &AiGeneratorConfig,
    owner_user_id: Uuid,
    prompt: &str,
    desired_question_count: usize,
    difficulty: Option<&str>,
    language: Option<&str>,
    question_format: Option<&str>,
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

            let user_prompt = build_user_prompt(
                prompt,
                desired_question_count,
                difficulty,
                language,
                question_format,
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
                        content: SYSTEM_PROMPT_QUIZ_GENERATION.to_string(),
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn build_user_prompt_uses_provided_values() {
        let user_prompt = build_user_prompt("Rust", 7, Some("hard"), Some("en"), Some("multi"));

        assert!(user_prompt.contains("Тема: Rust"));
        assert!(user_prompt.contains("Язык: en"));
        assert!(user_prompt.contains("Сложность: hard"));
        assert!(user_prompt.contains("Формат вопроса: multi"));
        assert!(user_prompt.contains("Желаемое число вопросов: 7"));
    }

    #[test]
    fn build_user_prompt_falls_back_to_defaults() {
        let user_prompt = build_user_prompt("История средневековой Европы", 3, None, None, None);

        assert!(user_prompt.contains("Тема: История средневековой Европы"));
        assert!(user_prompt.contains("Язык: русский"));
        assert!(user_prompt.contains("Сложность: medium"));
        assert!(user_prompt.contains("Формат вопроса: single"));
    }
}
