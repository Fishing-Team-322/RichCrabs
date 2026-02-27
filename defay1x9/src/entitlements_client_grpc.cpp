#include "entitlements_client.hpp"

#include <grpcpp/grpcpp.h>

#include <array>
#include <chrono>
#include <cstdio>
#include <ctime>
#include <cstdlib>
#include <optional>
#include <string>
#include <utility>

#include "entitlements.grpc.pb.h"

namespace {

using richcrab::v1::CheckEntitlementRequest;
using richcrab::v1::ReportUsageRequest;
using richcrab::v1::UserId;
using richcrab::v1::EntitlementsService;

std::string endOfDayIsoUtc() {
  const auto now = std::chrono::system_clock::now();
  const std::time_t t = std::chrono::system_clock::to_time_t(now);
  std::tm tm{};
  gmtime_r(&t, &tm);
  tm.tm_hour = 23;
  tm.tm_min = 59;
  tm.tm_sec = 59;
  const auto end = timegm(&tm);
  std::tm outTm{};
  gmtime_r(&end, &outTm);
  char out[64];
  std::strftime(out, sizeof(out), "%Y-%m-%dT%H:%M:%SZ", &outTm);
  return out;
}

int64_t endOfDayUnixUtc() {
  const auto now = std::chrono::system_clock::now();
  const std::time_t t = std::chrono::system_clock::to_time_t(now);
  std::tm tm{};
  gmtime_r(&t, &tm);
  tm.tm_hour = 23;
  tm.tm_min = 59;
  tm.tm_sec = 59;
  return static_cast<int64_t>(timegm(&tm));
}

QuizCoreRpcStatus mapGrpcStatus(const grpc::Status& status) {
  if (status.ok()) return QuizCoreRpcStatus::kOk;
  switch (status.error_code()) {
    case grpc::StatusCode::PERMISSION_DENIED: return QuizCoreRpcStatus::kPermissionDenied;
    case grpc::StatusCode::INVALID_ARGUMENT: return QuizCoreRpcStatus::kInvalidArgument;
    case grpc::StatusCode::NOT_FOUND: return QuizCoreRpcStatus::kNotFound;
    case grpc::StatusCode::FAILED_PRECONDITION:
    case grpc::StatusCode::RESOURCE_EXHAUSTED: return QuizCoreRpcStatus::kFailedPrecondition;
    case grpc::StatusCode::DEADLINE_EXCEEDED: return QuizCoreRpcStatus::kDeadlineExceeded;
    case grpc::StatusCode::UNAVAILABLE: return QuizCoreRpcStatus::kUnavailable;
    default: return QuizCoreRpcStatus::kUnknown;
  }
}

struct FeatureSpec final {
  std::string limit_name;
  std::string redis_field;
  uint64_t max = 0;
};

}  // namespace

class EntitlementsClientGrpc::Impl final {
public:
  Impl(const std::string& entitlementsAddr,
       int deadlineMs,
       std::string redisUrl,
       uint64_t roomsDailyLimit,
       uint64_t botsDailyLimit,
       uint64_t aiDailyLimit)
      : deadline_ms(deadlineMs),
        redis_url(std::move(redisUrl)),
        rooms_limit(roomsDailyLimit),
        bots_limit(botsDailyLimit),
        ai_limit(aiDailyLimit) {
    auto channel = grpc::CreateChannel(entitlementsAddr, grpc::InsecureChannelCredentials());
    entitlements = EntitlementsService::NewStub(channel);
  }

  std::optional<FeatureSpec> resolveFeature(const std::string& action) const {
    if (action == "CREATE_ROOM") return FeatureSpec{"rooms", "rooms", rooms_limit};
    if (action == "REGISTER_BOT") return FeatureSpec{"bots", "bots", bots_limit};
    if (action == "AI_GENERATE") return FeatureSpec{"ai", "ai", ai_limit};
    return std::nullopt;
  }

  std::string dailyKey(const std::string& userId, const std::string& field) const {
    std::time_t now = std::time(nullptr);
    std::tm tm{};
    gmtime_r(&now, &tm);
    char ymd[16];
    std::strftime(ymd, sizeof(ymd), "%Y%m%d", &tm);
    return "usage:" + userId + ":" + field + ":" + std::string(ymd);
  }

  std::optional<std::string> runRedisCommand(const std::string& command) const {
    if (redis_url.empty()) return std::nullopt;
    const std::string full = "redis-cli -u '" + redis_url + "' --raw " + command + " 2>/dev/null";
    FILE* pipe = popen(full.c_str(), "r");
    if (!pipe) return std::nullopt;
    std::string output;
    std::array<char, 256> buffer{};
    while (fgets(buffer.data(), static_cast<int>(buffer.size()), pipe) != nullptr) {
      output += buffer.data();
    }
    const auto rc = pclose(pipe);
    if (rc != 0) return std::nullopt;
    while (!output.empty() && (output.back() == '\n' || output.back() == '\r')) output.pop_back();
    return output;
  }

  bool checkEntitlementRpc(const std::string& userId, const std::string& action, EntitlementsClientError& error, bool& allowed) {
    grpc::ClientContext ctx;
    ctx.set_deadline(std::chrono::system_clock::now() + std::chrono::milliseconds(deadline_ms));

    CheckEntitlementRequest req;
    UserId uid;
    uid.set_value(userId);
    *req.mutable_user_id() = uid;
    req.set_feature(action);

    richcrab::v1::CheckEntitlementResponse resp;
    const auto status = entitlements->CheckEntitlement(&ctx, req, &resp);
    if (!status.ok()) {
      error.gateway_error = api::mapRpcError(mapGrpcStatus(status), "Entitlements.CheckEntitlement", "", status.error_message());
      return false;
    }
    allowed = resp.allowed();
    if (!allowed) {
      Json::Value details;
      details["reason"] = resp.reason();
      error.gateway_error = {api::GatewayErrorKind::kForbidden,
                             api::ErrorCode::kForbidden,
                             "entitlement denied",
                             details};
    }
    return true;
  }

  std::unique_ptr<EntitlementsService::Stub> entitlements;
  int deadline_ms;
  std::string redis_url;
  uint64_t rooms_limit;
  uint64_t bots_limit;
  uint64_t ai_limit;
};

EntitlementsClientGrpc::EntitlementsClientGrpc(const std::string& entitlementsAddr,
                                               int deadlineMs,
                                               const std::string& redisUrl,
                                               uint64_t roomsDailyLimit,
                                               uint64_t botsDailyLimit,
                                               uint64_t aiDailyLimit)
    : impl_(std::make_unique<Impl>(entitlementsAddr,
                                   deadlineMs,
                                   redisUrl,
                                   roomsDailyLimit,
                                   botsDailyLimit,
                                   aiDailyLimit)) {}

EntitlementsClientGrpc::~EntitlementsClientGrpc() = default;

std::optional<EntitlementsSnapshot> EntitlementsClientGrpc::getEntitlements(const std::string& userId,
                                                                            EntitlementsClientError& error) {
  auto usage = getUsage(userId, error);
  if (!usage) return std::nullopt;

  EntitlementsSnapshot out;
  out.limits["rooms"] = EntitlementLimit{"rooms", usage->usage["rooms"], impl_->rooms_limit, usage->period_ends_at};
  out.limits["bots"] = EntitlementLimit{"bots", usage->usage["bots"], impl_->bots_limit, usage->period_ends_at};
  out.limits["ai"] = EntitlementLimit{"ai", usage->usage["ai"], impl_->ai_limit, usage->period_ends_at};
  return out;
}

std::optional<UsageSnapshot> EntitlementsClientGrpc::getUsage(const std::string& userId, EntitlementsClientError& error) {
  UsageSnapshot out;
  out.usage["rooms"] = 0;
  out.usage["bots"] = 0;
  out.usage["ai"] = 0;
  out.period_ends_at = endOfDayIsoUtc();

  for (const auto& action : {std::string("CREATE_ROOM"), std::string("REGISTER_BOT"), std::string("AI_GENERATE")}) {
    const auto feature = impl_->resolveFeature(action);
    if (!feature) continue;
    const auto key = impl_->dailyKey(userId, feature->redis_field);
    const auto value = impl_->runRedisCommand("GET '" + key + "'");
    if (value.has_value() && !value->empty()) {
      try {
        out.usage[feature->limit_name] = std::stoull(*value);
      } catch (...) {
        error.gateway_error = {api::GatewayErrorKind::kBadGateway,
                               api::ErrorCode::kGrpcUnavailable,
                               "failed to parse usage value",
                               std::nullopt};
        return std::nullopt;
      }
    }
  }

  return out;
}

CheckAndConsumeResult EntitlementsClientGrpc::checkAndConsume(const std::string& userId, const std::string& actionType) {
  CheckAndConsumeResult result;
  EntitlementsClientError error;

  const auto feature = impl_->resolveFeature(actionType);
  if (!feature) {
    error.gateway_error = {api::GatewayErrorKind::kBadRequest,
                           api::ErrorCode::kValidationError,
                           "unsupported action type",
                           std::nullopt};
    result.error = error;
    return result;
  }

  bool allowedByRpc = false;
  if (impl_->checkEntitlementRpc(userId, actionType, error, allowedByRpc)) {
    if (!allowedByRpc) {
      error.gateway_error = {api::GatewayErrorKind::kForbidden,
                             api::ErrorCode::kForbidden,
                             "limit exceeded",
                             std::nullopt};
      error.limit = feature->limit_name;
      result.error = error;
      return result;
    }

    grpc::ClientContext reportCtx;
    reportCtx.set_deadline(std::chrono::system_clock::now() + std::chrono::milliseconds(impl_->deadline_ms));
    ReportUsageRequest report;
    UserId uid;
    uid.set_value(userId);
    *report.mutable_user_id() = uid;
    report.set_feature(actionType);
    report.set_units(1);

    richcrab::v1::ReportUsageResponse reportResp;
    const auto reportStatus = impl_->entitlements->ReportUsage(&reportCtx, report, &reportResp);
    if (reportStatus.ok() && reportResp.accepted()) {
      result.allowed = true;
      return result;
    }
  }

  const auto key = impl_->dailyKey(userId, feature->redis_field);
  const auto incremented = impl_->runRedisCommand("INCR '" + key + "'");
  if (!incremented.has_value()) {
    error.gateway_error = {api::GatewayErrorKind::kServiceUnavailable,
                           api::ErrorCode::kGrpcUnavailable,
                           "entitlements backend unavailable",
                           std::nullopt};
    result.error = error;
    return result;
  }

  impl_->runRedisCommand("EXPIREAT '" + key + "' " + std::to_string(endOfDayUnixUtc()));

  uint64_t used = 0;
  try {
    used = std::stoull(*incremented);
  } catch (...) {
    error.gateway_error = {api::GatewayErrorKind::kBadGateway,
                           api::ErrorCode::kGrpcUnavailable,
                           "invalid redis increment value",
                           std::nullopt};
    result.error = error;
    return result;
  }

  if (used > feature->max) {
    error.gateway_error = {api::GatewayErrorKind::kForbidden,
                           api::ErrorCode::kForbidden,
                           "limit exceeded",
                           std::nullopt};
    error.limit = feature->limit_name;
    error.retry_at = endOfDayIsoUtc();
    result.error = error;
    return result;
  }

  result.allowed = true;
  return result;
}
