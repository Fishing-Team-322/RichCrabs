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
        cb(CsrfTokenResponse(conf));
      },
      {drogon::Get});

  drogon::app().registerHandler(
      "/api/v1/auth/register",
      [conf](const drogon::HttpRequestPtr& req, std::function<void(const drogon::HttpResponsePtr&)>&& cb) {
        if (!RequireCsrf(req, conf, cb)) return;
        cb(notImplemented("POST /api/v1/auth/register"));
      },
      {drogon::Post});

  drogon::app().registerHandler(
      "/api/v1/auth/login",
      [conf](const drogon::HttpRequestPtr& req, std::function<void(const drogon::HttpResponsePtr&)>&& cb) {
        if (!RequireCsrf(req, conf, cb)) return;
        cb(notImplemented("POST /api/v1/auth/login"));
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
