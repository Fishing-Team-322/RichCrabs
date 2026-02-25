use std::{sync::OnceLock, time::Instant};

use axum::{http::StatusCode, response::IntoResponse};
use prometheus::{Encoder, HistogramVec, IntCounterVec, IntGauge, Registry, TextEncoder};
use tonic::{service::Interceptor, Request, Status};
use tracing::{field, info_span};
use uuid::Uuid;

static REGISTRY: OnceLock<Registry> = OnceLock::new();
static METRICS: OnceLock<Metrics> = OnceLock::new();

#[derive(Clone)]
pub struct Metrics {
    pub rooms_active: IntGauge,
    pub players_connected: IntGauge,
    pub grpc_latency_ms: HistogramVec,
    pub join_ticket_issued_total: IntCounterVec,
    pub tg_updates_total: IntCounterVec,
    pub errors_total: IntCounterVec,
}

impl Metrics {
    fn new() -> Self {
        let rooms_active = IntGauge::new("rooms_active", "Current active rooms").unwrap();
        let players_connected =
            IntGauge::new("players_connected", "Current connected players").unwrap();
        let grpc_latency_ms = HistogramVec::new(
            prometheus::HistogramOpts::new(
                "grpc_latency_ms",
                "gRPC request latency in milliseconds",
            ),
            &["service", "method"],
        )
        .unwrap();
        let join_ticket_issued_total = IntCounterVec::new(
            prometheus::Opts::new("join_ticket_issued_total", "Issued join tickets"),
            &["source"],
        )
        .unwrap();
        let tg_updates_total = IntCounterVec::new(
            prometheus::Opts::new("tg_updates_total", "Telegram updates processed"),
            &["status"],
        )
        .unwrap();
        let errors_total = IntCounterVec::new(
            prometheus::Opts::new("errors_total", "Total service errors"),
            &["service", "kind"],
        )
        .unwrap();

        Self {
            rooms_active,
            players_connected,
            grpc_latency_ms,
            join_ticket_issued_total,
            tg_updates_total,
            errors_total,
        }
    }
}

pub fn init_tracing(service: &str) {
    let env_filter = std::env::var(crate::config::LOG_LEVEL)
        .unwrap_or_else(|_| format!("{service}=info,tower_http=info"));
    let _ = tracing_subscriber::fmt()
        .with_env_filter(env_filter)
        .with_target(true)
        .with_level(true)
        .try_init();
}

pub fn init_metrics() -> &'static Metrics {
    METRICS.get_or_init(|| {
        let registry = REGISTRY.get_or_init(Registry::new);
        let m = Metrics::new();
        registry
            .register(Box::new(m.rooms_active.clone()))
            .expect("register rooms_active");
        registry
            .register(Box::new(m.players_connected.clone()))
            .expect("register players_connected");
        registry
            .register(Box::new(m.grpc_latency_ms.clone()))
            .expect("register grpc_latency_ms");
        registry
            .register(Box::new(m.join_ticket_issued_total.clone()))
            .expect("register join_ticket_issued_total");
        registry
            .register(Box::new(m.tg_updates_total.clone()))
            .expect("register tg_updates_total");
        registry
            .register(Box::new(m.errors_total.clone()))
            .expect("register errors_total");
        m
    })
}

pub fn metrics_text() -> Result<String, String> {
    let registry = REGISTRY.get_or_init(Registry::new);
    let mf = registry.gather();
    let mut buffer = Vec::new();
    TextEncoder::new()
        .encode(&mf, &mut buffer)
        .map_err(|e| e.to_string())?;
    String::from_utf8(buffer).map_err(|e| e.to_string())
}

pub async fn metrics_handler() -> impl IntoResponse {
    match metrics_text() {
        Ok(body) => (StatusCode::OK, body).into_response(),
        Err(err) => (StatusCode::INTERNAL_SERVER_ERROR, err).into_response(),
    }
}

pub fn error(service: &str, kind: &str) {
    init_metrics()
        .errors_total
        .with_label_values(&[service, kind])
        .inc();
}

#[derive(Clone)]
pub struct GrpcObservabilityInterceptor {
    service_name: &'static str,
}

impl GrpcObservabilityInterceptor {
    pub fn new(service_name: &'static str) -> Self {
        Self { service_name }
    }
}

impl Interceptor for GrpcObservabilityInterceptor {
    fn call(&mut self, mut request: Request<()>) -> Result<Request<()>, Status> {
        let req_id = request
            .metadata()
            .get("x-request-id")
            .and_then(|v| v.to_str().ok())
            .map(str::to_string)
            .unwrap_or_else(|| Uuid::new_v4().to_string());
        let room_id = request
            .metadata()
            .get("x-room-id")
            .and_then(|v| v.to_str().ok())
            .unwrap_or("");
        let user_id = request
            .metadata()
            .get("x-user-id")
            .and_then(|v| v.to_str().ok())
            .unwrap_or("");
        let bot_id = request
            .metadata()
            .get("x-bot-id")
            .and_then(|v| v.to_str().ok())
            .unwrap_or("");

        let span = info_span!(
            "grpc_request",
            request_id = %req_id,
            room_id = field::display(room_id),
            user_id = field::display(user_id),
            bot_id = field::display(bot_id)
        );
        request.extensions_mut().insert(span);
        request.extensions_mut().insert(Instant::now());
        request.extensions_mut().insert(self.service_name);
        Ok(request)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn metrics_output_contains_required_metrics() {
        let metrics = init_metrics();
        metrics
            .grpc_latency_ms
            .with_label_values(&["test", "method"])
            .observe(1.0);
        metrics.rooms_active.inc();
        metrics.players_connected.inc();
        metrics
            .join_ticket_issued_total
            .with_label_values(&["test"])
            .inc();
        metrics.tg_updates_total.with_label_values(&["ok"]).inc();
        metrics
            .errors_total
            .with_label_values(&["svc", "kind"])
            .inc();
        let body = metrics_text().expect("metrics text should be generated");

        assert!(body.contains("rooms_active"));
        assert!(body.contains("players_connected"));
        assert!(body.contains("grpc_latency_ms"));
        assert!(body.contains("join_ticket_issued_total"));
        assert!(body.contains("tg_updates_total"));
        assert!(body.contains("errors_total"));
    }
}
