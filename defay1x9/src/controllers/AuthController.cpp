#include "controllers/AuthController.hpp"

#include <drogon/drogon.h>

#include <algorithm>
#include <cctype>

#include "controllers/AuthStorage.hpp"
#include "controllers/ControllerUtils.hpp"
#include "csrf.hpp"
#include "http_api_utils.hpp"
#include "session.hpp"

namespace controllers {
namespace {

bool isValidEmail(std::string email) {
  std::transform(email.begin(), email.end(), email.begin(), [](unsigned char c) { return static_cast<char>(std::tolower(c)); });
  const auto at = email.find('@');
  return at != std::string::npos && at > 0 && at + 1 < email.size();
}

Json::Value userJson(const StoredUser& user) {
  Json::Value out;
  out["id"] = user.id;
  out["email"] = user.email;
  out["displayName"] = user.display_name;
  if (!user.avatar_url.empty()) out["avatarUrl"] = user.avatar_url;
  return out;
}

Json::Value todoDetails(const std::string& todo, const std::string& sourceError) {
  Json::Value out;
  out["todo"] = todo;
  out["sourceError"] = sourceError;
  return out;
}

void setAuthSession(const StoredUser& user, const Config& conf, const drogon::HttpResponsePtr& response) {
  security::SessionClaims claims;
  claims.role = "host";
  claims.pin = "AUTH";
  claims.room_id = "AUTH";
  claims.user_id = user.id;

  const std::string sessionToken = security::IssueSessionToken(claims, conf.session.ttl_seconds);
  security::SetSessionCookie(response, conf.session, sessionToken);
}

}  // namespace

void RegisterAuthRoutes(const Config& conf) {
  drogon::app().registerHandler(
      "/api/v1/auth/csrf",
      [conf](const drogon::HttpRequestPtr&, std::function<void(const drogon::HttpResponsePtr&)>&& cb) {
        cb(CsrfTokenResponse(conf));
      },
      {drogon::Get});

  drogon::app().registerHandler(
      "/api/v1/auth/register",
      [conf](const drogon::HttpRequestPtr& req, std::function<void(const drogon::HttpResponsePtr&)>&& cb) {
        if (!RequireCsrf(req, conf, cb)) return;

        std::string parseError;
        auto body = api::parseJsonBody(req, parseError);
        if (!body) {
          cb(api::jsonErrorResponse(400, api::ErrorCode::kInvalidJson, parseError));
          return;
        }

        api::JsonValidator validator(*body);
        const auto email = validator.requiredString("email");
        const auto password = validator.requiredString("password");
        const auto displayName = validator.requiredString("displayName");
        if (!validator.ok()) {
          cb(api::validationErrorResponse(validator.issues()));
          return;
        }
        if (!isValidEmail(*email)) validator.addIssue("email", "invalid_email");
        if (password->size() < 8) validator.addIssue("password", "too_short");
        if (!validator.ok()) {
          cb(api::validationErrorResponse(validator.issues()));
          return;
        }

        std::string storageError;
        if (!EnsureAuthSchema(conf, storageError)) {
          cb(api::jsonErrorResponse(503,
                                    api::ErrorCode::kGrpcUnavailable,
                                    "auth storage unavailable",
                                    todoDetails("configure postgres auth schema", storageError)));
          return;
        }

        StoredUser created;
        bool emailTaken = false;
        if (!CreateUser(conf, *email, *password, *displayName, created, storageError, emailTaken)) {
          if (emailTaken) {
            cb(api::jsonErrorResponse(409, api::ErrorCode::kEmailTaken, "email already registered"));
            return;
          }
          cb(api::jsonErrorResponse(503,
                                    api::ErrorCode::kGrpcUnavailable,
                                    "auth storage unavailable",
                                    todoDetails("create user in postgres", storageError)));
          return;
        }

        Json::Value responseBody;
        const auto csrfToken = security::IssueCsrfToken();
        responseBody["user"] = userJson(created);
        responseBody["csrfToken"] = csrfToken;

        auto response = drogon::HttpResponse::newHttpJsonResponse(responseBody);
        setAuthSession(created, conf, response);
        security::SetCsrfCookie(response, conf.csrf, csrfToken);
        cb(response);
      },
      {drogon::Post});

  drogon::app().registerHandler(
      "/api/v1/auth/login",
      [conf](const drogon::HttpRequestPtr& req, std::function<void(const drogon::HttpResponsePtr&)>&& cb) {
        if (!RequireCsrf(req, conf, cb)) return;

        std::string parseError;
        auto body = api::parseJsonBody(req, parseError);
        if (!body) {
          cb(api::jsonErrorResponse(400, api::ErrorCode::kInvalidJson, parseError));
          return;
        }

        api::JsonValidator validator(*body);
        const auto email = validator.requiredString("email");
        const auto password = validator.requiredString("password");
        if (!validator.ok()) {
          cb(api::validationErrorResponse(validator.issues()));
          return;
        }
        if (!isValidEmail(*email)) {
          cb(api::validationErrorResponse({{"email", "invalid_email"}}));
          return;
        }

        std::string storageError;
        if (!EnsureAuthSchema(conf, storageError)) {
          cb(api::jsonErrorResponse(503,
                                    api::ErrorCode::kGrpcUnavailable,
                                    "auth storage unavailable",
                                    todoDetails("configure postgres auth schema", storageError)));
          return;
        }

        StoredUser user;
        if (!VerifyPassword(conf, *email, *password, user, storageError)) {
          if (storageError.empty()) {
            cb(api::jsonErrorResponse(401, api::ErrorCode::kUnauthorized, "invalid email or password"));
            return;
          }
          cb(api::jsonErrorResponse(503,
                                    api::ErrorCode::kGrpcUnavailable,
                                    "auth storage unavailable",
                                    todoDetails("verify password in postgres", storageError)));
          return;
        }
        if (user.banned) {
          cb(api::jsonErrorResponse(403, api::ErrorCode::kForbidden, "user is banned"));
          return;
        }

        Json::Value responseBody;
        const auto csrfToken = security::IssueCsrfToken();
        responseBody["user"] = userJson(user);
        responseBody["csrfToken"] = csrfToken;

        auto response = drogon::HttpResponse::newHttpJsonResponse(responseBody);
        setAuthSession(user, conf, response);
        security::SetCsrfCookie(response, conf.csrf, csrfToken);
        cb(response);
      },
      {drogon::Post});

  drogon::app().registerHandler(
      "/api/v1/auth/logout",
      [conf](const drogon::HttpRequestPtr& req, std::function<void(const drogon::HttpResponsePtr&)>&& cb) {
        if (!RequireCsrf(req, conf, cb)) return;

        auto response = drogon::HttpResponse::newHttpResponse();
        response->setStatusCode(drogon::k204NoContent);
        security::ClearSessionCookie(response, conf.session);
        security::ClearCsrfCookie(response, conf.csrf);
        cb(response);
      },
      {drogon::Post});
}

}  // namespace controllers
