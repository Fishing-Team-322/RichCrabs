use crate::providers::error::ProviderError;

#[derive(Debug)]
pub enum AppError {
    InvalidArgument(String),
    PermissionDenied(String),
    NotFound(String),
    FailedPrecondition(String),
    Unavailable(String),
    Internal(String),
    Provider(ProviderError),
}

impl From<ProviderError> for AppError {
    fn from(value: ProviderError) -> Self {
        Self::Provider(value)
    }
}

impl std::fmt::Display for AppError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::InvalidArgument(m)
            | Self::PermissionDenied(m)
            | Self::NotFound(m)
            | Self::FailedPrecondition(m)
            | Self::Unavailable(m)
            | Self::Internal(m) => write!(f, "{m}"),
            Self::Provider(e) => write!(f, "{e}"),
        }
    }
}

impl std::error::Error for AppError {}
