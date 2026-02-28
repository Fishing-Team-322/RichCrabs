use tonic::metadata::MetadataMap;

use crate::application::error::AppError;

pub fn actor_user_id(metadata: &MetadataMap) -> Result<String, AppError> {
    metadata
        .get("x-user-id")
        .and_then(|v| v.to_str().ok())
        .map(str::to_string)
        .ok_or_else(|| AppError::InvalidArgument("x-user-id metadata is required".to_string()))
}

pub fn actor_role(metadata: &MetadataMap) -> String {
    metadata
        .get("x-user-role")
        .and_then(|v| v.to_str().ok())
        .unwrap_or_default()
        .to_string()
}
