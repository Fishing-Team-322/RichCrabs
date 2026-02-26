use tokio::sync::oneshot;
use tokio_stream::wrappers::TcpListenerStream;
use tonic::transport::Server;

#[derive(Default)]
struct HealthService;

#[tonic::async_trait]
impl proto::richcrab::v1::health_server::Health for HealthService {
    async fn ping(
        &self,
        _request: tonic::Request<proto::richcrab::v1::PingRequest>,
    ) -> Result<tonic::Response<proto::richcrab::v1::PingResponse>, tonic::Status> {
        Ok(tonic::Response::new(proto::richcrab::v1::PingResponse {
            message: "pong".to_string(),
        }))
    }
}

#[tokio::test]
async fn health_ping_responds_via_grpc_endpoint() {
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0")
        .await
        .expect("bind ephemeral port");
    let addr = listener.local_addr().expect("read local addr");

    let (mut health_reporter, grpc_health_service) = tonic_health::server::health_reporter();
    health_reporter
        .set_serving::<proto::richcrab::v1::health_server::HealthServer<HealthService>>()
        .await;

    let (shutdown_tx, shutdown_rx) = oneshot::channel::<()>();
    let server_task = tokio::spawn(async move {
        Server::builder()
            .add_service(grpc_health_service)
            .add_service(proto::richcrab::v1::health_server::HealthServer::new(
                HealthService,
            ))
            .serve_with_incoming_shutdown(TcpListenerStream::new(listener), async {
                let _ = shutdown_rx.await;
            })
            .await
    });

    let mut client =
        proto::richcrab::v1::health_client::HealthClient::connect(format!("http://{addr}"))
            .await
            .expect("connect health client");

    let response = client
        .ping(proto::richcrab::v1::PingRequest {})
        .await
        .expect("ping response")
        .into_inner();

    assert_eq!(response.message, "pong");

    let _ = shutdown_tx.send(());
    server_task
        .await
        .expect("server task join")
        .expect("server shutdown cleanly");
}
