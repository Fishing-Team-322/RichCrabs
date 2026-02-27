#include "controllers/ProfileController.hpp"

#include <drogon/drogon.h>

#include "controllers/AuthStorage.hpp"
#include "controllers/ControllerUtils.hpp"
#include "http_api_utils.hpp"
#include "session.hpp"

namespace controllers {
namespace {

Json::Value toProfileJson(const StoredUser& user) {
  Json::Value body;
  body["id"] = user.id;
  body["email"] = user.email;
  body["displayName"] = user.display_name;
  if (!user.avatar_url.empty()) body["avatarUrl"] = user.avatar_url;
  return body;
}

Json::Value todoDetails(const std::string& todo, const std::string& sourceError) {
  Json::Value out;
  out["todo"] = todo;
  out["sourceError"] = sourceError;
  return out;
}

std::optional<StoredUser> requireCurrentUser(const drogon::HttpRequestPtr& req,
                                             const Config& conf,
                                             const std::function<void(const drogon::HttpResponsePtr&)>& cb) {
  auto session = security::VerifySessionFromRequest(req, conf.session);
  if (!session || session->user_id.empty()) {
    cb(api::jsonErrorResponse(401, api::ErrorCode::kUnauthorized, "session cookie is missing or invalid"));
    return std::nullopt;
  }
  std::string err;
  if (!EnsureAuthSchema(conf, err)) {
    cb(api::jsonErrorResponse(
        503, api::ErrorCode::kGrpcUnavailable, "auth storage unavailable", todoDetails("configure postgres auth schema", err)));
    return std::nullopt;
  }
  auto user = FindUserById(conf, session->user_id, err);
  if (!err.empty()) {
    cb(api::jsonErrorResponse(503, api::ErrorCode::kGrpcUnavailable, "auth storage unavailable", todoDetails("load current user", err)));
    return std::nullopt;
  }
  if (!user) {
    cb(api::jsonErrorResponse(404, api::ErrorCode::kNotFound, "user not found"));
    return std::nullopt;
  }
  if (user->banned) {
    cb(api::jsonErrorResponse(403, api::ErrorCode::kForbidden, "user is banned"));
    return std::nullopt;
  }
  return user;
}

}  // namespace

void RegisterProfileRoutes(const Config& conf) {
  drogon::app().registerHandler(
      "/api/v1/me",
      [conf](const drogon::HttpRequestPtr& req, std::function<void(const drogon::HttpResponsePtr&)>&& cb) {
        auto user = requireCurrentUser(req, conf, cb);
        if (!user) return;
        cb(drogon::HttpResponse::newHttpJsonResponse(toProfileJson(*user)));
      },
      {drogon::Get});

  drogon::app().registerHandler(
      "/api/v1/me",
      [conf](const drogon::HttpRequestPtr& req, std::function<void(const drogon::HttpResponsePtr&)>&& cb) {
        if (!RequireCsrf(req, conf, cb)) return;

        std::string parseError;
        auto body = api::parseJsonBody(req, parseError);
        if (!body) {
          cb(api::jsonErrorResponse(400, api::ErrorCode::kInvalidJson, parseError));
          return;
        }

        api::JsonValidator validator(*body);
        const auto displayName = validator.optionalString("displayName");
        const auto avatarUrl = validator.optionalString("avatarUrl");
        validator.requireAtLeastOne({"displayName", "avatarUrl"}, "required");
        if (!validator.ok()) {
          cb(api::validationErrorResponse(validator.issues()));
          return;
        }

        auto currentUser = requireCurrentUser(req, conf, cb);
        if (!currentUser) return;

        std::string err;
        StoredUser updated;
        if (!UpdateProfile(conf, currentUser->id, displayName, avatarUrl, updated, err)) {
          if (err == "user not found") {
            cb(api::jsonErrorResponse(404, api::ErrorCode::kNotFound, "user not found"));
            return;
          }
          cb(api::jsonErrorResponse(
              503, api::ErrorCode::kGrpcUnavailable, "auth storage unavailable", todoDetails("update user profile", err)));
          return;
        }
        cb(drogon::HttpResponse::newHttpJsonResponse(toProfileJson(updated)));
      },
      {drogon::Patch});

  drogon::app().registerHandler(
      "/api/v1/me/password",
      [conf](const drogon::HttpRequestPtr& req, std::function<void(const drogon::HttpResponsePtr&)>&& cb) {
        if (!RequireCsrf(req, conf, cb)) return;

        std::string parseError;
        auto body = api::parseJsonBody(req, parseError);
        if (!body) {
          cb(api::jsonErrorResponse(400, api::ErrorCode::kInvalidJson, parseError));
          return;
        }

        api::JsonValidator validator(*body);
        const auto currentPassword = validator.requiredString("currentPassword");
        const auto newPassword = validator.requiredString("newPassword");
        if (newPassword && newPassword->size() < 8) validator.addIssue("newPassword", "too_short");
        if (!validator.ok()) {
          cb(api::validationErrorResponse(validator.issues()));
          return;
        }

        auto currentUser = requireCurrentUser(req, conf, cb);
        if (!currentUser) return;

        std::string err;
        bool mismatch = false;
        if (!ChangePassword(conf, currentUser->id, *currentPassword, *newPassword, err, mismatch)) {
          cb(api::jsonErrorResponse(
              503, api::ErrorCode::kGrpcUnavailable, "auth storage unavailable", todoDetails("change user password", err)));
          return;
        }
        if (mismatch) {
          cb(api::jsonErrorResponse(401, api::ErrorCode::kUnauthorized, "current password mismatch"));
          return;
        }

        auto response = drogon::HttpResponse::newHttpResponse();
        response->setStatusCode(drogon::k204NoContent);
        cb(response);
      },
      {drogon::Post});
}

}  // namespace controllers
