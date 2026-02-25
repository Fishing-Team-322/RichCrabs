use std::time::Duration;

use chrono::{Datelike, NaiveDate, Utc};
use shared::{redis_client::RedisClient, redis_keys};
use sqlx::PgPool;
use tonic::{Request, Response, Status};
use uuid::Uuid;

use crate::repository::{PlanRepository, UsageCounterRepository};

pub struct EntitlementsServiceImpl {
    plan_repository: PlanRepository,
    usage_repository: UsageCounterRepository,
    redis: RedisClient,
}

impl EntitlementsServiceImpl {
    pub fn new(pool: PgPool, redis: RedisClient) -> Self {
        Self {
            plan_repository: PlanRepository::new(pool.clone()),
            usage_repository: UsageCounterRepository::new(pool),
            redis,
        }
    }

    fn period_start() -> NaiveDate {
        let now = Utc::now().date_naive();
        NaiveDate::from_ymd_opt(now.year(), now.month(), 1).expect("valid month start")
    }

    fn counter_columns(feature: &str, units: u64) -> (i32, i32) {
        let units = units.min(i32::MAX as u64) as i32;
        match feature {
            "CREATE_ROOM" | "AI_GENERATE" => (units, 0),
            _ => (0, units),
        }
    }

    fn usage_cache_key(user_id: &str, feature: &str, period_start: NaiveDate) -> String {
        redis_keys::ratelimit_key(
            "usage",
            format!("{user_id}:{feature}:{}", period_start.format("%Y-%m")),
        )
    }

    async fn resolve_usage(&self, user_id: Uuid, feature: &str) -> Result<i32, Status> {
        let period_start = Self::period_start();
        let cache_key = Self::usage_cache_key(&user_id.to_string(), feature, period_start);

        if let Some(cached) = self
            .redis
            .get_value(&cache_key)
            .await
            .map_err(|e| Status::internal(format!("cache read failed: {e}")))?
        {
            if let Ok(value) = cached.parse::<i32>() {
                return Ok(value);
            }
        }

        let usage = self
            .usage_repository
            .find(user_id, period_start)
            .await
            .map_err(|e| Status::internal(format!("usage read failed: {e}")))?;
        let used = match feature {
            "CREATE_ROOM" | "AI_GENERATE" => usage.as_ref().map(|u| u.quizzes_created).unwrap_or(0),
            _ => usage.as_ref().map(|u| u.messages_sent).unwrap_or(0),
        };

        let _ = self
            .redis
            .set_with_ttl(&cache_key, &used.to_string(), Duration::from_secs(60 * 15))
            .await;

        Ok(used)
    }
}

#[tonic::async_trait]
impl proto::richcrab::v1::entitlements_service_server::EntitlementsService
    for EntitlementsServiceImpl
{
    async fn check_entitlement(
        &self,
        request: Request<proto::richcrab::v1::CheckEntitlementRequest>,
    ) -> Result<Response<proto::richcrab::v1::CheckEntitlementResponse>, Status> {
        let req = request.into_inner();
        let user = req
            .user_id
            .map(|id| id.value)
            .ok_or_else(|| Status::invalid_argument("user_id is required"))?;
        let user_id =
            Uuid::parse_str(&user).map_err(|_| Status::invalid_argument("user_id must be uuid"))?;
        let feature = req.feature;

        let mut plan = self
            .plan_repository
            .find_by_code("free")
            .await
            .map_err(|e| Status::internal(format!("plan lookup failed: {e}")))?;
        if plan.is_none() {
            plan = self
                .plan_repository
                .find_default()
                .await
                .map_err(|e| Status::internal(format!("plan lookup failed: {e}")))?;
        }
        let plan = plan.ok_or_else(|| Status::failed_precondition("no plans configured"))?;

        let used = self.resolve_usage(user_id, &feature).await?;
        let allowed = used < plan.monthly_quota;

        Ok(Response::new(
            proto::richcrab::v1::CheckEntitlementResponse {
                allowed,
                reason: if allowed {
                    "allowed".to_string()
                } else {
                    format!("monthly quota exceeded for plan {}", plan.code)
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
        let user = req
            .user_id
            .map(|id| id.value)
            .ok_or_else(|| Status::invalid_argument("user_id is required"))?;
        let user_id =
            Uuid::parse_str(&user).map_err(|_| Status::invalid_argument("user_id must be uuid"))?;

        let period_start = Self::period_start();
        let (quizzes_created, messages_sent) = Self::counter_columns(&req.feature, req.units);
        self.usage_repository
            .increment(user_id, period_start, quizzes_created, messages_sent)
            .await
            .map_err(|e| Status::internal(format!("usage write failed: {e}")))?;

        let updated = self.resolve_usage(user_id, &req.feature).await? + req.units as i32;
        let cache_key = Self::usage_cache_key(&user, &req.feature, period_start);
        let _ = self
            .redis
            .set_with_ttl(
                &cache_key,
                &updated.to_string(),
                Duration::from_secs(60 * 15),
            )
            .await;

        Ok(Response::new(proto::richcrab::v1::ReportUsageResponse {
            accepted: true,
            error: None,
        }))
    }
}
