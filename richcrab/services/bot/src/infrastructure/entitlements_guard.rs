use crate::application::error::AppError;

#[derive(Clone)]
pub struct EntitlementsGuard {
    client: proto::richcrab::v1::entitlements_service_client::EntitlementsServiceClient<
        tonic::transport::Channel,
    >,
}

impl EntitlementsGuard {
    pub fn new(
        client: proto::richcrab::v1::entitlements_service_client::EntitlementsServiceClient<
            tonic::transport::Channel,
        >,
    ) -> Self {
        Self { client }
    }

    pub async fn check_and_report(&self, user_id: &str, feature: &str) -> Result<(), AppError> {
        let mut client = self.client.clone();
        let check = client
            .check_entitlement(proto::richcrab::v1::CheckEntitlementRequest {
                user_id: Some(proto::richcrab::v1::UserId {
                    value: user_id.to_string(),
                }),
                feature: feature.to_string(),
            })
            .await
            .map_err(|e| AppError::Unavailable(format!("entitlements unavailable: {e}")))?
            .into_inner();

        if !check.allowed {
            return Err(AppError::PermissionDenied(check.reason));
        }

        client
            .report_usage(proto::richcrab::v1::ReportUsageRequest {
                user_id: Some(proto::richcrab::v1::UserId {
                    value: user_id.to_string(),
                }),
                feature: feature.to_string(),
                units: 1,
            })
            .await
            .map_err(|e| AppError::Unavailable(format!("usage reporting failed: {e}")))?;

        Ok(())
    }
}
