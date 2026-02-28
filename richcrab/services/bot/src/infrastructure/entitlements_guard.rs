use shared::entitlements_client::EntitlementsApi;

use crate::application::error::AppError;

#[derive(Clone)]
pub struct EntitlementsGuard {
    client: shared::entitlements_client::SharedEntitlementsClient,
}

impl EntitlementsGuard {
    pub fn new(
        client: proto::richcrab::v1::entitlements_service_client::EntitlementsServiceClient<
            tonic::transport::Channel,
        >,
    ) -> Self {
        Self {
            client: shared::entitlements_client::SharedEntitlementsClient::new(client),
        }
    }

    pub async fn check_and_report(&self, user_id: &str, feature: &str) -> Result<(), AppError> {
        let user_client = self.client.for_user(user_id);
        user_client
            .check(feature)
            .await
            .map_err(|error| Self::map_status(tonic::Status::from(error)))?;
        user_client
            .report(feature, 1)
            .await
            .map_err(|error| Self::map_status(tonic::Status::from(error)))?;
        Ok(())
    }

    fn map_status(status: tonic::Status) -> AppError {
        match status.code() {
            tonic::Code::PermissionDenied => {
                AppError::PermissionDenied(status.message().to_string())
            }
            tonic::Code::Unavailable => AppError::Unavailable(status.message().to_string()),
            _ => AppError::Internal(status.message().to_string()),
        }
    }
}
