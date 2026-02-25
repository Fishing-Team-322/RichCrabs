#include <drogon/drogon.h>
#include <spdlog/spdlog.h>

#include <fstream>
#include <sstream>
#include <string>

#include <json/value.h>

#include "config.hpp"
#include "csrf.hpp"
#include "quizcore_client.hpp"
#include "session.hpp"
#include "ws_gateway.hpp"

static std::string readFile(const std::string& path) {
  std::ifstream f(path, std::ios::binary);
  if (!f) return {};
  std::ostringstream ss;
  ss << f.rdbuf();
  return ss.str();
}

static drogon::HttpResponsePtr textResp(const std::string& body, drogon::ContentType type) {
  auto r = drogon::HttpResponse::newHttpResponse();
  r->setStatusCode(drogon::k200OK);
  r->setContentTypeCode(type);
  r->setBody(body);
  return r;
}

static drogon::HttpResponsePtr jsonError(int code, const std::string& msg) {
  Json::Value j;
  j["error"] = msg;
  auto resp = drogon::HttpResponse::newHttpJsonResponse(j);
  resp->setStatusCode(static_cast<drogon::HttpStatusCode>(code));
  return resp;
}

static drogon::HttpResponsePtr jsonOk(const Json::Value& j) {
  return drogon::HttpResponse::newHttpJsonResponse(j);
}

int main() {
  auto conf = Config::LoadFromEnv();
  security::SetSessionSigningKey(conf.session_signing_key);

  spdlog::info("listen {}:{}", conf.listen_host, conf.listen_port);
  spdlog::info("public_base_url={}", conf.public_base_url);
  spdlog::info("openapi_path={}", conf.openapi_path);

  QuizCoreClientGrpc quizCore(conf.quizcore_grpc_target);

  // -------- basics --------

  drogon::app().registerHandler(
      "/health",
      [](const drogon::HttpRequestPtr&, std::function<void(const drogon::HttpResponsePtr&)>&& cb) {
        cb(textResp("ok", drogon::CT_TEXT_PLAIN));
      },
      {drogon::Get});

  drogon::app().registerHandler(
      "/openapi.yaml",
      [conf](const drogon::HttpRequestPtr&, std::function<void(const drogon::HttpResponsePtr&)>&& cb) {
        auto y = readFile(conf.openapi_path);
        if (y.empty()) { cb(jsonError(404, "openapi_not_found")); return; }
        cb(textResp(y, drogon::CT_TEXT_PLAIN));
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
        cb(textResp(html, drogon::CT_TEXT_HTML));
      },
      {drogon::Get});

  // -------- CSRF --------
  // Для cookie-сессии:
  // - сервер ставит cookie XSRF-TOKEN
  // - фронт шлет header X-XSRF-TOKEN с тем же значением

  drogon::app().registerHandler(
      "/csrf",
      [conf](const drogon::HttpRequestPtr&, std::function<void(const drogon::HttpResponsePtr&)>&& cb) {
        const auto token = security::IssueCsrfToken();

        Json::Value r;
        r["token"] = token;

        auto resp = jsonOk(r);
        security::SetCsrfCookie(resp, conf.csrf, token);
        cb(resp);
      },
      {drogon::Get});

  // -------- Session debug (очень полезно для фронта) --------
  drogon::app().registerHandler(
      "/me",
      [conf](const drogon::HttpRequestPtr& req, std::function<void(const drogon::HttpResponsePtr&)>&& cb) {
        auto s = security::VerifySessionFromRequest(req, conf.session);
        if (!s) { cb(jsonError(401, "no_session")); return; }

        Json::Value r;
        r["pin"] = s->pin;
        r["role"] = s->role;
        r["roomId"] = s->room_id;
        r["playerId"] = s->player_id;
        r["userId"] = s->user_id;
        r["exp"] = static_cast<Json::Int64>(s->exp);
        cb(jsonOk(r));
      },
      {drogon::Get});

  // -------- API --------

  // POST /api/v1/games  (создать игру = логин host)
  drogon::app().registerHandler(
      "/api/v1/games",
      [&quizCore, conf](const drogon::HttpRequestPtr& req, std::function<void(const drogon::HttpResponsePtr&)>&& cb) {
        auto jptr = req->getJsonObject();
        if (!jptr) { cb(jsonError(400, "invalid_json")); return; }

        const auto& body = *jptr;
        const std::string topic = body.get("topic", "").asString();
        const int qpt = body.get("questionsPerTeam", 0).asInt();
        if (topic.empty()) { cb(jsonError(400, "topic_required")); return; }

        auto out = quizCore.createRoom(topic, qpt);
        if (!out) { cb(jsonError(502, "quizcore_create_failed")); return; }

        // выдаём сессию host в HttpOnly cookie
        security::SessionClaims claims;
        claims.role = "host";
        claims.pin = out->pin;
        claims.room_id = out->room_id;
        claims.user_id = "gw-owner";

        const std::string sessionToken = security::IssueSessionToken(claims, conf.session.ttl_seconds);

        // выдаём CSRF сразу (удобно, чтобы host мог сразу /start дернуть)
        const std::string csrfToken = security::IssueCsrfToken();

        Json::Value r;
        r["pin"] = out->pin;
        r["role"] = "host";
        r["wsUrl"] = conf.public_base_url + "/ws";
        r["csrfToken"] = csrfToken;

        auto resp = jsonOk(r);
        security::SetSessionCookie(resp, conf.session, sessionToken);
        security::SetCsrfCookie(resp, conf.csrf, csrfToken);
        cb(resp);
      },
      {drogon::Post});

  // POST /api/v1/games/{pin}/join (join = логин player)
  drogon::app().registerHandler(
      "/api/v1/games/{1}/join",
      [&quizCore, conf](const drogon::HttpRequestPtr& req, std::function<void(const drogon::HttpResponsePtr&)>&& cb, std::string pin) {
        auto jptr = req->getJsonObject();
        if (!jptr) { cb(jsonError(400, "invalid_json")); return; }

        const std::string name = (*jptr).get("name", "").asString();
        auto out = quizCore.joinRoomByPin(pin, name);
        if (!out) { cb(jsonError(404, "game_not_found_or_closed")); return; }

        security::SessionClaims claims;
        claims.role = "player";
        claims.pin = pin;
        claims.room_id = out->room_id;
        claims.player_id = out->player_id;

        const std::string sessionToken = security::IssueSessionToken(claims, conf.session.ttl_seconds);
        const std::string csrfToken = security::IssueCsrfToken();

        Json::Value r;
        r["playerId"] = out->player_id;
        r["team"] = "A";
        r["role"] = "player";
        r["wsUrl"] = conf.public_base_url + "/ws";
        r["csrfToken"] = csrfToken;

        auto resp = jsonOk(r);
        security::SetSessionCookie(resp, conf.session, sessionToken);
        security::SetCsrfCookie(resp, conf.csrf, csrfToken);
        cb(resp);
      },
      {drogon::Post});

  // POST /api/v1/games/{pin}/start  (host-only + CSRF)
  drogon::app().registerHandler(
      "/api/v1/games/{1}/start",
      [&quizCore, conf](const drogon::HttpRequestPtr& req, std::function<void(const drogon::HttpResponsePtr&)>&& cb, std::string pin) {
        // 1) session must exist
        auto s = security::VerifySessionFromRequest(req, conf.session);
        if (!s) { cb(jsonError(401, "no_session")); return; }

        // 2) host-only
        if (s->role != "host") { cb(jsonError(403, "host_only")); return; }
        if (s->pin != pin) { cb(jsonError(403, "pin_mismatch")); return; }

        // 3) CSRF check
        if (!security::VerifyCsrf(req, conf.csrf)) { cb(jsonError(403, "csrf_failed")); return; }

        // 4) perform action using host user_id
        if (s->room_id.empty()) { cb(jsonError(403, "room_missing")); return; }

        auto roomState = quizCore.getRoomState(s->room_id);
        if (!roomState) { cb(jsonError(404, "room_not_found")); return; }

        if (!quizCore.startGame(s->room_id, s->user_id)) { cb(jsonError(409, "cannot_start")); return; }

        auto resp = drogon::HttpResponse::newHttpResponse();
        resp->setStatusCode(drogon::k204NoContent);
        cb(resp);
      },
      {drogon::Post});

  // POST /logout (CSRF required)
  drogon::app().registerHandler(
      "/logout",
      [conf](const drogon::HttpRequestPtr& req, std::function<void(const drogon::HttpResponsePtr&)>&& cb) {
        if (!security::VerifyCsrf(req, conf.csrf)) { cb(jsonError(403, "csrf_failed")); return; }

        Json::Value r;
        r["ok"] = true;

        auto resp = jsonOk(r);
        security::ClearSessionCookie(resp, conf.session);
        cb(resp);
      },
      {drogon::Post});

  drogon::app().addListener(conf.listen_host, conf.listen_port).run();
  return 0;
}