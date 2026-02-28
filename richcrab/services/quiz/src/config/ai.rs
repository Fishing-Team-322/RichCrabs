use std::env;

#[derive(Debug, Clone)]
pub(crate) struct AiGeneratorConfig {
    pub(crate) addr: String,
    pub(crate) model: String,
    pub(crate) api_key: String,
    pub(crate) request_timeout_ms: u64,
    pub(crate) max_retries: u32,
}

pub(crate) fn load_ai_generator_config_from_env() -> Option<AiGeneratorConfig> {
    let addr = env::var(shared::config::GIGACHAT_API_ADDR).ok()?;
    let api_key = env::var(shared::config::GIGACHAT_API_KEY).ok()?;
    let model =
        env::var(shared::config::GIGACHAT_MODEL).unwrap_or_else(|_| "GigaChat-Pro".to_string());

    let request_timeout_ms = env::var("QUIZ_AI_TIMEOUT_MS")
        .ok()
        .and_then(|v| v.parse::<u64>().ok())
        .unwrap_or(8_000);
    let max_retries = env::var("QUIZ_AI_MAX_RETRIES")
        .ok()
        .and_then(|v| v.parse::<u32>().ok())
        .unwrap_or(2);

    Some(AiGeneratorConfig {
        addr,
        model,
        api_key,
        request_timeout_ms,
        max_retries,
    })
}
