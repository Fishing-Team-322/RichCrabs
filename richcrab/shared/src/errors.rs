use thiserror::Error;

#[derive(Debug, Error)]
pub enum SharedError {
    #[error("configuration error: {0}")]
    Config(String),
    #[error("internal error: {0}")]
    Internal(String),
}
