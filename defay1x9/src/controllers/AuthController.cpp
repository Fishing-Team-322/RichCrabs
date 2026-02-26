#include "controllers/AuthController.hpp"

#include <drogon/drogon.h>

#include "controllers/ControllerUtils.hpp"
#include "csrf.hpp"
#include "http_api_utils.hpp"
#include "session.hpp"

namespace controllers {

void RegisterAuthRoutes(const Config& conf) {
  drogon::app().registerHandler(
      "/api/v1/auth/csrf",
      [conf](const drogon::HttpRequestPtr&, std::function<void(const drogon::HttpResponsePtr&)>&& cb) {
        const auto token = security::IssueCsrfToken();
        Json::Value body;
        body["token"] = token;

        auto response = drogon::HttpResponse::newHttpJsonResponse(body);
        security::SetCsrfCookie(response, conf.csrf, token);
        cb(response);
      },
      {drogon::Get});

  drogon::app().registerHandler(
      "/api/v1/auth/register",
      [](const drogon::HttpRequestPtr&, std::function<void(const drogon::HttpResponsePtr&)>&& cb) {
        cb(notImplemented("POST /api/v1/auth/register"));
      },
      {drogon::Post});

  drogon::app().registerHandler(
      "/api/v1/auth/login",
      [](const drogon::HttpRequestPtr&, std::function<void(const drogon::HttpResponsePtr&)>&& cb) {
        cb(notImplemented("POST /api/v1/auth/login"));
      },
      {drogon::Post});

  drogon::app().registerHandler(
      "/api/v1/auth/logout",
      [conf](const drogon::HttpRequestPtr& req, std::function<void(const drogon::HttpResponsePtr&)>&& cb) {
        if (!security::VerifyCsrf(req, conf.csrf)) {
          cb(api::jsonErrorResponse(403, "csrf_failed", "csrf token mismatch"));
          return;
        }

        Json::Value body;
        body["ok"] = true;

        auto response = drogon::HttpResponse::newHttpJsonResponse(body);
        security::ClearSessionCookie(response, conf.session);
        cb(response);
      },
      {drogon::Post});
}

}  // namespace controllers
