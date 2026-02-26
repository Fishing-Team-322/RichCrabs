#include "controllers/ServiceController.hpp"

#include <drogon/drogon.h>

#include <fstream>
#include <sstream>

#include "controllers/ControllerUtils.hpp"
#include "csrf.hpp"
#include "http_api_utils.hpp"
#include "session.hpp"

namespace {

std::string readFile(const std::string& path) {
  std::ifstream file(path, std::ios::binary);
  if (!file) return {};

  std::ostringstream stream;
  stream << file.rdbuf();
  return stream.str();
}

drogon::HttpResponsePtr textResponse(const std::string& body, drogon::ContentType type) {
  auto response = drogon::HttpResponse::newHttpResponse();
  response->setStatusCode(drogon::k200OK);
  response->setContentTypeCode(type);
  response->setBody(body);
  return response;
}

}  // namespace

namespace controllers {

void RegisterServiceRoutes(const Config& conf, QuizCoreClient& quizCore) {
  drogon::app().registerHandler(
      "/health",
      [&quizCore](const drogon::HttpRequestPtr& req, std::function<void(const drogon::HttpResponsePtr&)>&& cb) {
        const auto requestId = requestIdFromRequest(req);
        const bool checkGrpc = req->getOptionalParameter<bool>("grpc").value_or(false);

        Json::Value body;
        body["status"] = "ok";
        body["gateway"] = "ok";
        body["requestId"] = requestId;

        if (checkGrpc) {
          const bool grpcOk = quizCore.pingHealth(requestId);
          body["dependencies"]["rust_grpc"] = grpcOk ? "ok" : "down";
          if (!grpcOk) {
            body["status"] = "degraded";
            auto response = drogon::HttpResponse::newHttpJsonResponse(body);
            response->setStatusCode(drogon::k503ServiceUnavailable);
            cb(response);
            return;
          }
        }

        cb(drogon::HttpResponse::newHttpJsonResponse(body));
      },
      {drogon::Get});

  drogon::app().registerHandler(
      "/openapi.yaml",
      [conf](const drogon::HttpRequestPtr&, std::function<void(const drogon::HttpResponsePtr&)>&& cb) {
        auto schema = readFile(conf.openapi_path);
        if (schema.empty()) {
          cb(api::jsonErrorResponse(404, api::ErrorCode::kNotFound, "openapi schema file is missing"));
          return;
        }
        cb(textResponse(schema, drogon::CT_TEXT_PLAIN));
      },
      {drogon::Get});

  drogon::app().registerHandler(
      "/docs",
      [](const drogon::HttpRequestPtr&, std::function<void(const drogon::HttpResponsePtr&)>&& cb) {
        const char* html = R"HTML(
<!doctype html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>API Docs</title>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css">
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
  <script>
    window.onload = () => SwaggerUIBundle({ url: "/openapi.yaml", dom_id: "#swagger-ui" });
  </script>
</body>
</html>
)HTML";
        cb(textResponse(html, drogon::CT_TEXT_HTML));
      },
      {drogon::Get});

  drogon::app().registerHandler(
      "/csrf",
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
      "/logout",
      [conf](const drogon::HttpRequestPtr& req, std::function<void(const drogon::HttpResponsePtr&)>&& cb) {
        if (!security::VerifyCsrf(req, conf.csrf)) {
          cb(api::jsonErrorResponse(403, api::ErrorCode::kCsrfRequired, "csrf token mismatch"));
          return;
        }

        Json::Value body;
        body["ok"] = true;

        auto response = drogon::HttpResponse::newHttpJsonResponse(body);
        security::ClearSessionCookie(response, conf.session);
        cb(response);
      },
      {drogon::Post});

  drogon::app().registerHandler(
      "/api/v1/session",
      [conf](const drogon::HttpRequestPtr& req, std::function<void(const drogon::HttpResponsePtr&)>&& cb) {
        auto session = security::VerifySessionFromRequest(req, conf.session);
        if (!session) {
          cb(api::jsonErrorResponse(401, api::ErrorCode::kUnauthorized, "session cookie is missing or invalid"));
          return;
        }

        Json::Value body;
        body["authenticated"] = true;
        body["role"] = session->role;
        body["roomId"] = session->room_id;
        body["pin"] = session->pin;
        body["playerId"] = session->player_id;
        body["userId"] = session->user_id;
        body["exp"] = static_cast<Json::Int64>(session->exp);
        cb(drogon::HttpResponse::newHttpJsonResponse(body));
      },
      {drogon::Get});
}

}  // namespace controllers
