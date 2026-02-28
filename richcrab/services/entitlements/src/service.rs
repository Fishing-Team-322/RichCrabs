use std::time::Duration;

use chrono::{Datelike, NaiveDate, Utc};
use shared::{redis_client::RedisClient, redis_keys};
use sqlx::PgPool;
use tonic::{Request, Response, Status};
use uuid::Uuid;

use crate::repository::{PlanRepository, UsageCounterRepository, UserRepository};

pub struct EntitlementsServiceImpl {
    plan_repository: PlanRepository,
    user_repository: UserRepository,
    usage_repository: UsageCounterRepository,
    redis: RedisClient,
}

impl EntitlementsServiceImpl {
    pub fn new(pool: PgPool, redis: RedisClient) -> Self {
        Self {
            plan_repository: PlanRepository::new(pool.clone()),
            user_repository: UserRepository::new(pool.clone()),
            usage_repository: UsageCounterRepository::new(pool),
            redis,
        }
    }

    fn period_start() -> NaiveDate {
        let now = Utc::now().date_naive();
        NaiveDate::from_ymd_opt(now.year(), now.month(), 1).expect("valid month start")
    }

    fn usage_units(feature: &str, units: u64) -> [i32; 6] {
        let units = units.min(i32::MAX as u64) as i32;
        match feature {
            "CREATE_ROOM" => [units, 0, 0, 0, 0, 0],
            "START_GAME" => [0, units, 0, 0, 0, 0],
            "REGISTER_BOT" => [0, 0, units, 0, 0, 0],
            "AI_GENERATE" => [0, 0, 0, units, 0, 0],
            "CREATE_QUIZ" => [0, 0, 0, 0, units, 0],
            _ => [0, 0, 0, 0, 0, units],
        }
    }

    fn usage_for_feature(feature: &str, usage: &crate::repository::UsageCounter) -> i32 {
        match feature {
            "CREATE_ROOM" => usage.rooms_created,
            "START_GAME" => usage.rooms_started,
            "REGISTER_BOT" => usage.bots_registered,
            "AI_GENERATE" => usage.ai_jobs_started,
            "CREATE_QUIZ" => usage.quizzes_created_count,
            _ => usage.messages_sent_count,
        }
    }

    fn usage_cache_key(user_id: &str, feature: &str, period_start: NaiveDate) -> String {
        redis_keys::ratelimit_key(
            "usage",
            format!("{user_id}:{feature}:{}", period_start.format("%Y-%m")),
        )
    }

    fn plan_cache_key(user_id: &str) -> String {
        redis_keys::ratelimit_key("plan", user_id)
    }

    async fn resolve_user_plan(&self, user_id: Uuid) -> Result<crate::repository::Plan, Status> {
        let user_key = user_id.to_string();
        let plan_cache_key = Self::plan_cache_key(&user_key);

        if let Some(cached_plan_code) = self
            .redis
            .get_value(&plan_cache_key)
            .await
            .map_err(|e| Status::internal(format!("cache read failed: {e}")))?
        {
            if let Some(plan) = self
                .plan_repository
                .find_by_code(&cached_plan_code)
                .await
                .map_err(|e| Status::internal(format!("plan lookup failed: {e}")))?
            {
                return Ok(plan);
            }
        }

        self.user_repository
            .ensure_exists(user_id)
            .await
            .map_err(|e| Status::internal(format!("user ensure failed: {e}")))?;

        let user_plan_code = self
            .user_repository
            .find_plan_code(user_id)
            .await
            .map_err(|e| Status::internal(format!("user lookup failed: {e}")))?;

        let mut plan = if let Some(plan_code) = user_plan_code {
            self.plan_repository
                .find_by_code(&plan_code)
                .await
                .map_err(|e| Status::internal(format!("plan lookup failed: {e}")))?
        } else {
            None
        };

        if plan.is_none() {
            plan = self
                .plan_repository
                .find_by_code("free")
                .await
                .map_err(|e| Status::internal(format!("plan lookup failed: {e}")))?;
        }
        if plan.is_none() {
            plan = self
                .plan_repository
                .find_default()
                .await
                .map_err(|e| Status::internal(format!("plan lookup failed: {e}")))?;
        }

        let plan = plan.ok_or_else(|| Status::failed_precondition("no plans configured"))?;

        let _ = self
            .redis
            .set_with_ttl(&plan_cache_key, &plan.code, Duration::from_secs(60 * 15))
            .await;

        Ok(plan)
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
            .map_err(|e| Status::internal(format!("usage read failed: {e}")))?
            .unwrap_or_default();
        let used = Self::usage_for_feature(feature, &usage);

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

        let plan = self.resolve_user_plan(user_id).await?;
        let used = self.resolve_usage(user_id, &feature).await?;
        let allowed = used < plan.monthly_quota;

        Ok(Response::new(
            proto::richcrab::v1::CheckEntitlementResponse {
                allowed,
                reason: if allowed {
                    format!(
                        "allowed: feature={feature} used={used} quota={} plan={}",
                        plan.monthly_quota, plan.code
                    )
                } else {
                    format!(
                        "quota_exceeded: feature={feature} used={used} quota={} plan={}",
                        plan.monthly_quota, plan.code
                    )
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
        let [rooms_created, rooms_started, bots_registered, ai_jobs_started, quizzes_created_count, messages_sent_count] =
            Self::usage_units(&req.feature, req.units);

        self.user_repository
            .ensure_exists(user_id)
            .await
            .map_err(|e| Status::internal(format!("user ensure failed: {e}")))?;

        self.usage_repository
            .increment(
                user_id,
                period_start,
                rooms_created,
                rooms_started,
                bots_registered,
                ai_jobs_started,
                quizzes_created_count,
                messages_sent_count,
            )
            .await
            .map_err(|e| Status::internal(format!("usage write failed: {e}")))?;

        let updated = self.resolve_usage(user_id, &req.feature).await?;
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

#[cfg(test)]
mod tests {
    use super::EntitlementsServiceImpl;

    #[test]
    fn usage_units_maps_known_features() {
        assert_eq!(
            EntitlementsServiceImpl::usage_units("CREATE_ROOM", 2),
            [2, 0, 0, 0, 0, 0]
        );
        assert_eq!(
            EntitlementsServiceImpl::usage_units("START_GAME", 3),
            [0, 3, 0, 0, 0, 0]
        );
        assert_eq!(
            EntitlementsServiceImpl::usage_units("REGISTER_BOT", 1),
            [0, 0, 1, 0, 0, 0]
        );
        assert_eq!(
            EntitlementsServiceImpl::usage_units("AI_GENERATE", 4),
            [0, 0, 0, 4, 0, 0]
        );
        assert_eq!(
            EntitlementsServiceImpl::usage_units("CREATE_QUIZ", 5),
            [0, 0, 0, 0, 5, 0]
        );
    }
}
