#[derive(Debug)]
pub enum ProviderError {
    Timeout(String),
    Unavailable(String),
    InvalidInput(String),
    FailedPrecondition(String),
    Internal(String),
}

impl std::fmt::Display for ProviderError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Timeout(msg)
            | Self::Unavailable(msg)
            | Self::InvalidInput(msg)
            | Self::FailedPrecondition(msg)
            | Self::Internal(msg) => write!(f, "{msg}"),
        }
    }
}

impl std::error::Error for ProviderError {}
