#include "controllers/AdminController.hpp"

#include <drogon/drogon.h>

#include <algorithm>
#include <cctype>
#include <optional>

#include "controllers/AuthStorage.hpp"
#include "controllers/ControllerUtils.hpp"
#include "http_api_utils.hpp"
#include "session.hpp"

namespace controllers {
namespace {

std::string lower(std::string value) {
  std::transform(value.begin(), value.end(), value.begin(), [](unsigned char c) { return static_cast<char>(std::tolower(c)); });
  return value;
}

Json::Value todoDetails(const std::string& todo, const std::string& sourceError) {
  Json::Value out;
  out["todo"] = todo;
  out["sourceError"] = sourceError;
  return out;
}

bool requireAdmin(const drogon::HttpRequestPtr& req,
                  const Config& conf,
                  const std::function<void(const drogon::HttpResponsePtr&)>& cb) {
  auto session = security::VerifySessionFromRequest(req, conf.session);
  if (!session || session->user_id.empty()) {
    cb(api::jsonErrorResponse(401, api::ErrorCode::kUnauthorized, "session cookie is missing or invalid"));
    return false;
  }
  if (session->role == "admin") return true;

  std::string err;
  if (!EnsureAuthSchema(conf, err)) {
    cb(api::jsonErrorResponse(
        503, api::ErrorCode::kGrpcUnavailable, "auth storage unavailable", todoDetails("configure postgres auth schema", err)));
    return false;
  }
  auto user = FindUserById(conf, session->user_id, err);
  if (!err.empty()) {
    cb(api::jsonErrorResponse(503, api::ErrorCode::kGrpcUnavailable, "auth storage unavailable", todoDetails("load admin identity", err)));
    return false;
  }
  if (!user) {
    cb(api::jsonErrorResponse(403, api::ErrorCode::kForbidden, "admin access required"));
    return false;
  }

  if (user->role == "admin" || conf.admin_emails.contains(lower(user->email))) return true;
  cb(api::jsonErrorResponse(403, api::ErrorCode::kForbidden, "admin access required"));
  return false;
}

}  // namespace

void RegisterAdminRoutes(const Config& conf, QuizCoreClient& quizCore) {
  drogon::app().registerHandler(
      "/admin/api/stats",
      [conf](const drogon::HttpRequestPtr& req, std::function<void(const drogon::HttpResponsePtr&)>&& cb) {
        if (!requireAdmin(req, conf, cb)) return;

        std::string err;
        if (!EnsureAuthSchema(conf, err)) {
          cb(api::jsonErrorResponse(
              503, api::ErrorCode::kGrpcUnavailable, "auth storage unavailable", todoDetails("configure postgres auth schema", err)));
          return;
        }
        auto stats = LoadAdminStats(conf, err);
        if (!err.empty()) {
          cb(api::jsonErrorResponse(
              503, api::ErrorCode::kGrpcUnavailable, "stats unavailable", todoDetails("wire rust rpc for admin stats", err)));
          return;
        }
        cb(drogon::HttpResponse::newHttpJsonResponse(stats));
      },
      {drogon::Get});

  drogon::app().registerHandler(
      "/admin/api/users/{1}/ban",
      [conf](const drogon::HttpRequestPtr& req, std::function<void(const drogon::HttpResponsePtr&)>&& cb, std::string userId) {
        if (!RequireCsrf(req, conf, cb)) return;
        if (!requireAdmin(req, conf, cb)) return;

        std::string parseError;
        auto body = api::parseJsonBody(req, parseError);
        if (!body) {
          cb(api::jsonErrorResponse(400, api::ErrorCode::kInvalidJson, parseError));
          return;
        }
        api::JsonValidator validator(*body);
        const auto reason = validator.requiredString("reason");
        if (!validator.ok()) {
          cb(api::validationErrorResponse(validator.issues()));
          return;
        }

        std::string err;
        bool found = false;
        if (!SetUserBan(conf, userId, true, *reason, err, found)) {
          cb(api::jsonErrorResponse(
              503, api::ErrorCode::kGrpcUnavailable, "ban unavailable", todoDetails("wire rust rpc for user bans", err)));
          return;
        }
        if (!found) {
          cb(api::jsonErrorResponse(404, api::ErrorCode::kNotFound, "user not found"));
          return;
        }
        auto response = drogon::HttpResponse::newHttpResponse();
        response->setStatusCode(drogon::k204NoContent);
        cb(response);
      },
      {drogon::Post});

  drogon::app().registerHandler(
      "/admin/api/users/{1}/unban",
      [conf](const drogon::HttpRequestPtr& req, std::function<void(const drogon::HttpResponsePtr&)>&& cb, std::string userId) {
        if (!RequireCsrf(req, conf, cb)) return;
        if (!requireAdmin(req, conf, cb)) return;

        std::string parseError;
        auto body = api::parseJsonBody(req, parseError);
        if (!body) {
          cb(api::jsonErrorResponse(400, api::ErrorCode::kInvalidJson, parseError));
          return;
        }
        api::JsonValidator validator(*body);
        const auto reason = validator.requiredString("reason");
        if (!validator.ok()) {
          cb(api::validationErrorResponse(validator.issues()));
          return;
        }

        std::string err;
        bool found = false;
        if (!SetUserBan(conf, userId, false, *reason, err, found)) {
          cb(api::jsonErrorResponse(
              503, api::ErrorCode::kGrpcUnavailable, "unban unavailable", todoDetails("wire rust rpc for user unban", err)));
          return;
        }
        if (!found) {
          cb(api::jsonErrorResponse(404, api::ErrorCode::kNotFound, "user not found"));
          return;
        }
        auto response = drogon::HttpResponse::newHttpResponse();
        response->setStatusCode(drogon::k204NoContent);
        cb(response);
      },
      {drogon::Post});

  drogon::app().registerHandler(
      "/admin/api/bots/{1}/disable",
      [&quizCore, conf](const drogon::HttpRequestPtr& req, std::function<void(const drogon::HttpResponsePtr&)>&& cb, std::string botId) {
        if (!RequireCsrf(req, conf, cb)) return;
        if (!requireAdmin(req, conf, cb)) return;

        std::string parseError;
        auto body = api::parseJsonBody(req, parseError);
        std::optional<std::string> reason;
        if (body) {
          api::JsonValidator validator(*body);
          reason = validator.optionalString("reason");
          if (!validator.ok()) {
            cb(api::validationErrorResponse(validator.issues()));
            return;
          }
        }

        auto session = security::VerifySessionFromRequest(req, conf.session);
        if (!session || session->user_id.empty()) {
          cb(api::jsonErrorResponse(401, api::ErrorCode::kUnauthorized, "session cookie is missing or invalid"));
          return;
        }

        const auto requestId = requestIdFromRequest(req);
        auto result = quizCore.updateBotStatus(session->user_id, botId, false, reason, requestId, "admin");
        if (result.status == QuizCoreRpcStatus::kNotFound) {
          cb(api::jsonErrorResponse(404, api::ErrorCode::kNotFound, "bot not found"));
          return;
        }
        if (result.status == QuizCoreRpcStatus::kPermissionDenied) {
          cb(api::jsonErrorResponse(403, api::ErrorCode::kForbidden, "admin access required"));
          return;
        }
        if (result.status != QuizCoreRpcStatus::kOk) {
          cb(api::jsonErrorResponse(api::mapRpcError(result.status, "update_bot_status", result.error_code, result.error_message)));
          return;
        }

        auto response = drogon::HttpResponse::newHttpResponse();
        response->setStatusCode(drogon::k204NoContent);
        cb(response);
      },
      {drogon::Post});
}

}  // namespace controllers
