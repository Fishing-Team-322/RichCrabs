use std::sync::Arc;

use tonic::Status;

#[tonic::async_trait]
pub trait EntitlementsClient: Send + Sync {
    async fn check_entitlement(&self, user_id: &str, feature: &str) -> Result<(), Status>;
    async fn report_usage(&self, user_id: &str, feature: &str, units: u64) -> Result<(), Status>;
}

pub type DynEntitlementsClient = Arc<dyn EntitlementsClient>;

#[derive(Clone)]
pub struct GrpcEntitlementsClient {
    inner: proto::richcrab::v1::entitlements_service_client::EntitlementsServiceClient<
        tonic::transport::Channel,
    >,
}

impl GrpcEntitlementsClient {
    pub fn new(
        inner: proto::richcrab::v1::entitlements_service_client::EntitlementsServiceClient<
            tonic::transport::Channel,
        >,
    ) -> Self {
        Self { inner }
    }
}

#[tonic::async_trait]
impl EntitlementsClient for GrpcEntitlementsClient {
    async fn check_entitlement(&self, user_id: &str, feature: &str) -> Result<(), Status> {
        let mut client = self.inner.clone();
        let response = client
            .check_entitlement(proto::richcrab::v1::CheckEntitlementRequest {
                user_id: Some(proto::richcrab::v1::UserId {
                    value: user_id.to_string(),
                }),
                feature: feature.to_string(),
            })
            .await
            .map_err(|e| Status::unavailable(format!("entitlements unavailable: {e}")))?
            .into_inner();

        if response.allowed {
            Ok(())
        } else {
            Err(Status::permission_denied(response.reason))
        }
    }

    async fn report_usage(&self, user_id: &str, feature: &str, units: u64) -> Result<(), Status> {
        let mut client = self.inner.clone();
        client
            .report_usage(proto::richcrab::v1::ReportUsageRequest {
                user_id: Some(proto::richcrab::v1::UserId {
                    value: user_id.to_string(),
                }),
                feature: feature.to_string(),
                units,
            })
            .await
            .map_err(|e| Status::unavailable(format!("entitlements unavailable: {e}")))?;
        Ok(())
    }
}
