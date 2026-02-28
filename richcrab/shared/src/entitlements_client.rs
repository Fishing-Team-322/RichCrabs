use tonic::{transport::Channel, Status};

#[derive(Debug, Clone)]
pub enum EntitlementsError {
    Unavailable(String),
    PermissionDenied(String),
}

impl From<EntitlementsError> for Status {
    fn from(value: EntitlementsError) -> Self {
        match value {
            EntitlementsError::Unavailable(message) => Status::unavailable(message),
            EntitlementsError::PermissionDenied(message) => Status::permission_denied(message),
        }
    }
}

#[tonic::async_trait]
pub trait EntitlementsApi: Send + Sync {
    async fn check(&self, feature: &str) -> Result<(), EntitlementsError>;
    async fn report(&self, feature: &str, units: u64) -> Result<(), EntitlementsError>;
}

#[derive(Clone)]
pub struct SharedEntitlementsClient {
    inner: proto::richcrab::v1::entitlements_service_client::EntitlementsServiceClient<Channel>,
}

impl SharedEntitlementsClient {
    pub fn new(
        inner: proto::richcrab::v1::entitlements_service_client::EntitlementsServiceClient<Channel>,
    ) -> Self {
        Self { inner }
    }

    pub fn for_user(&self, user_id: impl Into<String>) -> UserEntitlementsClient {
        UserEntitlementsClient {
            inner: self.inner.clone(),
            user_id: user_id.into(),
        }
    }

    fn transport_error(error: tonic::Status) -> EntitlementsError {
        EntitlementsError::Unavailable(format!("entitlements unavailable: {error}"))
    }
}

#[derive(Clone)]
pub struct UserEntitlementsClient {
    inner: proto::richcrab::v1::entitlements_service_client::EntitlementsServiceClient<Channel>,
    user_id: String,
}

#[tonic::async_trait]
impl EntitlementsApi for UserEntitlementsClient {
    async fn check(&self, feature: &str) -> Result<(), EntitlementsError> {
        let mut client = self.inner.clone();
        let response = client
            .check_entitlement(proto::richcrab::v1::CheckEntitlementRequest {
                user_id: Some(proto::richcrab::v1::UserId {
                    value: self.user_id.clone(),
                }),
                feature: feature.to_string(),
            })
            .await
            .map_err(SharedEntitlementsClient::transport_error)?
            .into_inner();

        if response.allowed {
            Ok(())
        } else {
            Err(EntitlementsError::PermissionDenied(response.reason))
        }
    }

    async fn report(&self, feature: &str, units: u64) -> Result<(), EntitlementsError> {
        let mut client = self.inner.clone();
        client
            .report_usage(proto::richcrab::v1::ReportUsageRequest {
                user_id: Some(proto::richcrab::v1::UserId {
                    value: self.user_id.clone(),
                }),
                feature: feature.to_string(),
                units,
            })
            .await
            .map_err(SharedEntitlementsClient::transport_error)?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use std::{net::SocketAddr, sync::Arc};

    use tokio::net::TcpListener;
    use tokio::sync::Mutex;
    use tokio_stream::wrappers::TcpListenerStream;
    use tonic::{transport::Server, Request, Response, Status};

    use super::{EntitlementsApi, SharedEntitlementsClient};

    #[derive(Default, Clone)]
    struct MockEntitlementsState {
        checks: Arc<Mutex<Vec<(String, String)>>>,
        reports: Arc<Mutex<Vec<(String, String, u64)>>>,
        deny_feature: Option<String>,
        fail_report_for: Option<String>,
    }

    #[derive(Clone)]
    struct MockEntitlementsService {
        state: MockEntitlementsState,
    }

    #[tonic::async_trait]
    impl proto::richcrab::v1::entitlements_service_server::EntitlementsService
        for MockEntitlementsService
    {
        async fn check_entitlement(
            &self,
            request: Request<proto::richcrab::v1::CheckEntitlementRequest>,
        ) -> Result<Response<proto::richcrab::v1::CheckEntitlementResponse>, Status> {
            let req = request.into_inner();
            let user_id = req.user_id.map(|v| v.value).unwrap_or_default();
            self.state
                .checks
                .lock()
                .await
                .push((user_id, req.feature.clone()));

            let denied = self
                .state
                .deny_feature
                .as_ref()
                .map(|f| f == &req.feature)
                .unwrap_or(false);

            Ok(Response::new(
                proto::richcrab::v1::CheckEntitlementResponse {
                    allowed: !denied,
                    reason: if denied {
                        "feature denied".to_string()
                    } else {
                        String::new()
                    },
                    error: None,
                },
            ))
        }

        async fn report_usage(
            &self,
            request: Request<proto::richcrab::v1::ReportUsageRequest>,
        ) -> Result<Response<proto::richcrab::v1::ReportUsageResponse>, Status> {
            let req = request.into_inner();
            let user_id = req.user_id.map(|v| v.value).unwrap_or_default();
            self.state
                .reports
                .lock()
                .await
                .push((user_id, req.feature.clone(), req.units));

            if self
                .state
                .fail_report_for
                .as_ref()
                .map(|f| f == &req.feature)
                .unwrap_or(false)
            {
                return Err(Status::unavailable("downstream report failed"));
            }

            Ok(Response::new(proto::richcrab::v1::ReportUsageResponse {
                accepted: true,
                error: None,
            }))
        }
    }

    async fn start_server(state: MockEntitlementsState) -> SocketAddr {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();
        let incoming = TcpListenerStream::new(listener);

        tokio::spawn(async move {
            Server::builder()
                .add_service(
                    proto::richcrab::v1::entitlements_service_server::EntitlementsServiceServer::new(
                        MockEntitlementsService { state },
                    ),
                )
                .serve_with_incoming(incoming)
                .await
                .unwrap();
        });

        addr
    }

    #[tokio::test]
    async fn check_and_report_contracts() {
        let state = MockEntitlementsState::default();
        let addr = start_server(state.clone()).await;

        let grpc =
            proto::richcrab::v1::entitlements_service_client::EntitlementsServiceClient::connect(
                format!("http://{addr}"),
            )
            .await
            .unwrap();
        let client = SharedEntitlementsClient::new(grpc).for_user("user-1");

        client.check("CREATE_ROOM").await.unwrap();
        client.report("CREATE_ROOM", 2).await.unwrap();

        assert_eq!(
            state.checks.lock().await.as_slice(),
            &[("user-1".to_string(), "CREATE_ROOM".to_string())]
        );
        assert_eq!(
            state.reports.lock().await.as_slice(),
            &[("user-1".to_string(), "CREATE_ROOM".to_string(), 2)]
        );
    }

    #[tokio::test]
    async fn maps_permission_denied_from_check() {
        let state = MockEntitlementsState {
            deny_feature: Some("AI_GENERATE".to_string()),
            ..Default::default()
        };
        let addr = start_server(state).await;

        let grpc =
            proto::richcrab::v1::entitlements_service_client::EntitlementsServiceClient::connect(
                format!("http://{addr}"),
            )
            .await
            .unwrap();
        let client = SharedEntitlementsClient::new(grpc).for_user("user-2");

        let status: Status = client.check("AI_GENERATE").await.unwrap_err().into();
        assert_eq!(status.code(), tonic::Code::PermissionDenied);
    }

    #[tokio::test]
    async fn maps_transport_error_to_unavailable() {
        let state = MockEntitlementsState {
            fail_report_for: Some("BOT_COMMAND".to_string()),
            ..Default::default()
        };
        let addr = start_server(state).await;

        let grpc =
            proto::richcrab::v1::entitlements_service_client::EntitlementsServiceClient::connect(
                format!("http://{addr}"),
            )
            .await
            .unwrap();
        let client = SharedEntitlementsClient::new(grpc).for_user("user-3");

        let status: Status = client.report("BOT_COMMAND", 1).await.unwrap_err().into();
        assert_eq!(status.code(), tonic::Code::Unavailable);
    }
}
