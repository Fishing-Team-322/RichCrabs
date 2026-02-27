#include "controllers/ControllerUtils.hpp"

#include <drogon/HttpRequest.h>
#include <spdlog/spdlog.h>

#include <random>

#include "csrf.hpp"
#include "http_api_utils.hpp"
#include "session.hpp"

namespace {


struct UserResolution final {
  std::optional<std::string> user_id;
  int http_status = 401;
  std::string reason;
};

bool IsLocalSmokeFallbackAllowed(const Config& conf) {
  if (!conf.auth_local_smoke_fallback_enabled) return false;
  return conf.app_env == "local" || conf.app_env == "smoke" || conf.app_env == "dev" ||
         conf.app_env == "development" || conf.app_env == "test";
}

UserResolution ResolveUser(const drogon::HttpRequestPtr& req, const Config& conf) {
  const auto sessionCookie = req->getCookie(conf.session.cookie_name);
  auto session = security::VerifySessionFromRequest(req, conf.session);
  if (session && session->role == "host" && !session->user_id.empty()) {
    return {.user_id = session->user_id, .http_status = 200, .reason = "ok"};
  }

  std::string reason = "session_invalid";
  int httpStatus = 401;
  if (sessionCookie.empty()) {
    reason = "session_cookie_missing";
  } else if (!session) {
    reason = "session_cookie_invalid";
  } else if (session->role != "host") {
    reason = "session_role_forbidden";
    httpStatus = 403;
  } else if (session->user_id.empty()) {
    reason = "session_user_id_missing";
  }

  if (IsLocalSmokeFallbackAllowed(conf) && !conf.default_user_id.empty()) {
    spdlog::warn("auth_local_smoke_fallback_default_user_id reason={} env={} path={}",
                 reason,
                 conf.app_env,
                 req->path());
    return {.user_id = conf.default_user_id, .http_status = 200, .reason = reason};
  }

  spdlog::warn("auth_denied reason={} env={} path={}", reason, conf.app_env, req->path());
  return {.user_id = std::nullopt, .http_status = httpStatus, .reason = reason};
}

std::string generateRequestId() {
  static constexpr char kHex[] = "0123456789abcdef";
  static thread_local std::mt19937_64 rng{std::random_device{}()};
  std::uniform_int_distribution<uint64_t> dist(0, 0xffffffffffffffffULL);

  auto toHex = [&](uint64_t value) {
    std::string out(16, '0');
    for (int i = 15; i >= 0; --i) {
      out[i] = kHex[value & 0xF];
      value >>= 4;
    }
    return out;
  };

  return toHex(dist(rng)) + toHex(dist(rng));
}

}  // namespace

namespace controllers {

std::string requestIdFromRequest(const drogon::HttpRequestPtr& req) {
  const auto incoming = req->getHeader("x-request-id");
  return incoming.empty() ? generateRequestId() : incoming;
}

std::string clientIpFromRequest(const drogon::HttpRequestPtr& req) {
  const auto forwardedFor = req->getHeader("x-forwarded-for");
  if (!forwardedFor.empty()) {
    const auto comma = forwardedFor.find(',');
    if (comma == std::string::npos) return forwardedFor;
    return forwardedFor.substr(0, comma);
  }
  const auto realIp = req->getHeader("x-real-ip");
  if (!realIp.empty()) return realIp;
  return req->peerAddr().toIp();
}

std::optional<std::string> resolveUserId(const drogon::HttpRequestPtr& req, const Config& conf) {
  return ResolveUser(req, conf).user_id;
}

bool RequireUserId(const drogon::HttpRequestPtr& req,
                   const Config& conf,
                   const std::function<void(const drogon::HttpResponsePtr&)>& cb,
                   std::string& userIdOut) {
  auto resolved = ResolveUser(req, conf);
  if (!resolved.user_id.has_value()) {
    if (resolved.http_status == 403) {
      cb(api::jsonErrorResponse(403, api::ErrorCode::kForbidden, "host session is required"));
    } else {
      cb(api::jsonErrorResponse(401, api::ErrorCode::kUnauthorized, "session cookie is missing or invalid"));
    }
    return false;
  }
  userIdOut = *resolved.user_id;
  return true;
}

Json::Value botToJson(const QuizCoreBot& bot, const std::optional<BotState>& state) {
  Json::Value out;
  out["botId"] = bot.bot_id;
  out["name"] = state && state->name.has_value() ? *state->name : bot.name;
  out["version"] = bot.version;
  out["status"] = bot.status;
  out["registeredAt"] = static_cast<Json::Int64>(bot.registered_at);
  out["enabled"] = state ? state->enabled : (bot.status != "disabled");
  out["metadata"] = state ? state->metadata : Json::Value(Json::objectValue);
  return out;
}

drogon::HttpResponsePtr notImplemented(const std::string& endpoint) {
  return api::jsonErrorResponse(501, api::ErrorCode::kNotImplemented, endpoint + " is not implemented");
}


bool RequireCsrf(const drogon::HttpRequestPtr& req,
                 const Config& conf,
                 const std::function<void(const drogon::HttpResponsePtr&)>& cb) {
  if (security::VerifyCsrf(req, conf.csrf)) return true;
  cb(api::jsonErrorResponse(403, api::ErrorCode::kCsrfRequired, "csrf token mismatch"));
  return false;
}

drogon::HttpResponsePtr CsrfTokenResponse(const Config& conf) {
  const auto token = security::IssueCsrfToken();
  Json::Value body;
  body["token"] = token;

  auto response = drogon::HttpResponse::newHttpJsonResponse(body);
  security::SetCsrfCookie(response, conf.csrf, token);
  return response;
}

}  // namespace controllers
