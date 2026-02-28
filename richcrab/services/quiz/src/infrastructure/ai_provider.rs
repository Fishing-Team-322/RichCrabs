use anyhow::{anyhow, Result};
use serde::Deserialize;
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

#[derive(Debug, Default, Deserialize)]
struct PromptUiParams {
    theme: Option<String>,
    language: Option<String>,
    difficulty: Option<String>,
    question_format: Option<String>,
}

impl PromptUiParams {
    fn from_prompt(prompt: &str) -> Self {
        let parsed = serde_json::from_str::<PromptUiParams>(prompt).unwrap_or_default();
        let fallback_theme = prompt.trim();

        Self {
            theme: parsed
                .theme
                .or_else(|| (!fallback_theme.is_empty()).then(|| fallback_theme.to_string())),
            language: parsed.language,
            difficulty: parsed.difficulty,
            question_format: parsed.question_format,
        }
    }

    fn user_prompt(&self, desired_question_count: usize) -> String {
        USER_PROMPT_TEMPLATE
            .replace("{theme}", self.theme.as_deref().unwrap_or("не указана"))
            .replace("{language}", self.language.as_deref().unwrap_or("русский"))
            .replace(
                "{difficulty}",
                self.difficulty.as_deref().unwrap_or("medium"),
            )
            .replace(
                "{question_format}",
                self.question_format.as_deref().unwrap_or("single"),
            )
            .replace(
                "{desired_question_count}",
                &desired_question_count.to_string(),
            )
    }
}

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

            let ui_params = PromptUiParams::from_prompt(prompt);
            let user_prompt = ui_params.user_prompt(desired_question_count);

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
    fn prompt_ui_params_uses_json_values() {
        let params = PromptUiParams::from_prompt(
            r#"{"theme":"Rust","language":"en","difficulty":"hard","question_format":"multi"}"#,
        );

        let user_prompt = params.user_prompt(7);
        assert!(user_prompt.contains("Тема: Rust"));
        assert!(user_prompt.contains("Язык: en"));
        assert!(user_prompt.contains("Сложность: hard"));
        assert!(user_prompt.contains("Формат вопроса: multi"));
        assert!(user_prompt.contains("Желаемое число вопросов: 7"));
    }

    #[test]
    fn prompt_ui_params_falls_back_to_plain_prompt_as_theme() {
        let params = PromptUiParams::from_prompt("История средневековой Европы");

        let user_prompt = params.user_prompt(3);
        assert!(user_prompt.contains("Тема: История средневековой Европы"));
        assert!(user_prompt.contains("Язык: русский"));
        assert!(user_prompt.contains("Сложность: medium"));
        assert!(user_prompt.contains("Формат вопроса: single"));
    }
}
