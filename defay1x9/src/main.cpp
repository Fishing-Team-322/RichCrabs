#include <drogon/drogon.h>
#include <spdlog/spdlog.h>

#include <fstream>
#include <random>
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

static std::string resolveUserId(const drogon::HttpRequestPtr& req, const Config& conf) {
  auto s = security::VerifySessionFromRequest(req, conf.session);
  if (s && s->role == "host" && !s->user_id.empty()) return s->user_id;
  return conf.default_user_id;
}

static int mapRpcStatusToHttp(QuizCoreRpcStatus status) {
  switch (status) {
    case QuizCoreRpcStatus::kPermissionDenied: return 403;
    case QuizCoreRpcStatus::kInvalidArgument: return 400;
    case QuizCoreRpcStatus::kFailedPrecondition: return 409;
    case QuizCoreRpcStatus::kUnavailable: return 503;
    case QuizCoreRpcStatus::kOk: return 502;
    case QuizCoreRpcStatus::kUnknown:
    default: return 502;
  }
}

static Json::Value botToJson(const QuizCoreBot& bot) {
  Json::Value j;
  j["botId"] = bot.bot_id;
  j["name"] = bot.name;
  j["version"] = bot.version;
  j["status"] = bot.status;
  j["registeredAt"] = static_cast<Json::Int64>(bot.registered_at);
  return j;
}

static std::string generateRequestId() {
  static constexpr char kHex[] = "0123456789abcdef";
  static thread_local std::mt19937_64 rng{std::random_device{}()};
  std::uniform_int_distribution<uint64_t> dist(0, 0xffffffffffffffffULL);
  auto toHex = [&](uint64_t v) {
    std::string out(16, '0');
    for (int i = 15; i >= 0; --i) {
      out[i] = kHex[v & 0xF];
      v >>= 4;
    }
    return out;
  };
  return toHex(dist(rng)) + toHex(dist(rng));
}

static std::string requestIdFromRequest(const drogon::HttpRequestPtr& req) {
  const auto incoming = req->getHeader("x-request-id");
  return incoming.empty() ? generateRequestId() : incoming;
}

int main() {
  auto conf = Config::LoadFromEnv();
  security::SetSessionSigningKey(conf.session_signing_key);

  spdlog::info("listen {}:{}", conf.listen_host, conf.listen_port);
  spdlog::info("public_base_url={}", conf.public_base_url);
  spdlog::info("openapi_path={}", conf.openapi_path);

  QuizCoreClientGrpc quizCore(conf.grpc_game_addr,
                              conf.grpc_join_addr,
                              conf.grpc_bot_addr,
                              conf.grpc_deadline_ms_create_room,
                              conf.grpc_deadline_ms_issue_join_ticket,
                              conf.grpc_deadline_ms_join_room,
                              conf.grpc_deadline_ms_start_game,
                              conf.grpc_deadline_ms_get_room_state);

  // -------- basics --------

  drogon::app().registerHandler(
      "/health",
      [&quizCore](const drogon::HttpRequestPtr& req, std::function<void(const drogon::HttpResponsePtr&)>&& cb) {
        const auto requestId = requestIdFromRequest(req);
        const bool checkGrpc = req->getOptionalParameter<bool>("grpc").value_or(false);

        Json::Value r;
        r["status"] = "ok";
        r["gateway"] = "ok";
        r["requestId"] = requestId;

        if (checkGrpc) {
          const bool grpcOk = quizCore.pingHealth(requestId);
          r["dependencies"]["rust_grpc"] = grpcOk ? "ok" : "down";
          if (!grpcOk) {
            r["status"] = "degraded";
            auto resp = drogon::HttpResponse::newHttpJsonResponse(r);
            resp->setStatusCode(drogon::k503ServiceUnavailable);
            cb(resp);
            return;
          }
        }

        cb(jsonOk(r));
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

        const auto requestId = requestIdFromRequest(req);
        const auto& body = *jptr;
        const std::string ownerUserId = body.get("ownerUserId", conf.default_user_id).asString();
        const std::string quizId = body.get("quizId", "").asString();
        const std::string title = body.get("title", "").asString();
        if (quizId.empty()) { cb(jsonError(400, "quiz_id_required")); return; }
        if (title.empty()) { cb(jsonError(400, "title_required")); return; }

        spdlog::info("create_game request_id={} pin=- room_id=- player_id=-", requestId);
        auto out = quizCore.createRoom(ownerUserId, quizId, title, requestId);
        if (!out) { cb(jsonError(502, "quizcore_create_failed")); return; }

        // выдаём сессию host в HttpOnly cookie
        security::SessionClaims claims;
        claims.role = "host";
        claims.pin = out->pin;
        claims.room_id = out->room_id;
        claims.user_id = ownerUserId;

        const std::string sessionToken = security::IssueSessionToken(claims, conf.session.ttl_seconds);

        // выдаём CSRF сразу (удобно, чтобы host мог сразу /start дернуть)
        const std::string csrfToken = security::IssueCsrfToken();

        Json::Value r;
        r["pin"] = out->pin;
        r["inviteToken"] = out->invite_token;
        r["inviteUrl"] = conf.public_base_url + "/invite/" + out->invite_token;
        r["wsUrl"] = conf.public_base_url + "/ws";
        spdlog::info("create_game_ok request_id={} pin={} room_id={} player_id=-", requestId, out->pin, out->room_id);

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

        const auto requestId = requestIdFromRequest(req);
        const std::string name = (*jptr).get("name", "").asString();
        spdlog::info("join_by_pin request_id={} pin={} room_id=- player_id=-", requestId, pin);
        auto out = quizCore.joinRoomByPin(pin, name, requestId);
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
        spdlog::info("join_by_pin_ok request_id={} pin={} room_id={} player_id={}", requestId, pin, out->room_id, out->player_id);

        auto resp = jsonOk(r);
        security::SetSessionCookie(resp, conf.session, sessionToken);
        security::SetCsrfCookie(resp, conf.csrf, csrfToken);
        cb(resp);
      },
      {drogon::Post});

  // POST /api/v1/invites/{inviteToken}/join (join = login player by invite token)
  drogon::app().registerHandler(
      "/api/v1/invites/{1}/join",
      [&quizCore, conf](const drogon::HttpRequestPtr& req, std::function<void(const drogon::HttpResponsePtr&)>&& cb, std::string inviteToken) {
        auto jptr = req->getJsonObject();
        if (!jptr) { cb(jsonError(400, "invalid_json")); return; }

        const auto requestId = requestIdFromRequest(req);
        const std::string name = (*jptr).get("name", "").asString();
        spdlog::info("join_by_invite request_id={} pin=- room_id=- player_id=-", requestId);
        auto out = quizCore.joinRoomByInvite(inviteToken, name, requestId);
        if (!out) { cb(jsonError(404, "game_not_found_or_closed")); return; }

        security::SessionClaims claims;
        claims.role = "player";
        claims.room_id = out->room_id;
        claims.player_id = out->player_id;

        const std::string sessionToken = security::IssueSessionToken(claims, conf.session.ttl_seconds);
        const std::string csrfToken = security::IssueCsrfToken();

        Json::Value r;
        r["playerId"] = out->player_id;
        r["team"] = "A";
        r["role"] = "player";
        r["wsUrl"] = conf.public_base_url + "/ws";
        spdlog::info("join_by_invite_ok request_id={} pin=- room_id={} player_id={}", requestId, out->room_id, out->player_id);

        auto resp = jsonOk(r);
        security::SetSessionCookie(resp, conf.session, sessionToken);
        security::SetCsrfCookie(resp, conf.csrf, csrfToken);
        cb(resp);
      },
      {drogon::Post});

  // POST /api/v1/games/{pin}/start  (host-only + CSRF)
  drogon::app().registerHandler(
      "/api/v1/games/{1}/start",
      [&quizCore, conf](const drogon::HttpRequestPtr& req, std::function<void(const drogon::HttpResponsePtr&)>&& cb, std::string /*pin*/) {
        const auto requestId = requestIdFromRequest(req);
        // 1) session must exist
        auto s = security::VerifySessionFromRequest(req, conf.session);
        if (!s) { cb(jsonError(401, "no_session")); return; }

        // 2) host-only
        if (s->role != "host") { cb(jsonError(403, "host_only")); return; }

        // 3) CSRF check
        if (!security::VerifyCsrf(req, conf.csrf)) { cb(jsonError(403, "csrf_failed")); return; }

        // 4) perform action using host user_id
        if (s->room_id.empty()) { cb(jsonError(403, "room_missing")); return; }

        spdlog::info("start_game request_id={} pin={} room_id={} player_id=-", requestId, s->pin, s->room_id);
        if (!quizCore.startGame(s->room_id, s->user_id, requestId)) { cb(jsonError(409, "cannot_start")); return; }

        auto resp = drogon::HttpResponse::newHttpResponse();
        resp->setStatusCode(drogon::k204NoContent);
        cb(resp);
      },
      {drogon::Post});

  // POST /api/v1/bots
  drogon::app().registerHandler(
      "/api/v1/bots",
      [&quizCore, conf](const drogon::HttpRequestPtr& req, std::function<void(const drogon::HttpResponsePtr&)>&& cb) {
        auto jptr = req->getJsonObject();
        if (!jptr) { cb(jsonError(400, "invalid_json")); return; }

        const std::string name = (*jptr).get("name", "").asString();
        const std::string version = (*jptr).get("version", "").asString();
        const std::string endpoint = (*jptr).get("endpoint", "").asString();
        if (name.empty() || version.empty() || endpoint.empty()) {
          cb(jsonError(400, "name_version_endpoint_required"));
          return;
        }

        const auto requestId = requestIdFromRequest(req);
        const auto result = quizCore.registerBot(resolveUserId(req, conf), name, version, endpoint, requestId);
        if (!result.bot) {
          cb(jsonError(mapRpcStatusToHttp(result.status), "bot_register_failed"));
          return;
        }

        Json::Value r;
        r["bot"] = botToJson(*result.bot);
        cb(jsonOk(r));
      },
      {drogon::Post});

  // GET /api/v1/bots
  drogon::app().registerHandler(
      "/api/v1/bots",
      [&quizCore, conf](const drogon::HttpRequestPtr& req, std::function<void(const drogon::HttpResponsePtr&)>&& cb) {
        const auto requestId = requestIdFromRequest(req);
        const auto result = quizCore.listBots(resolveUserId(req, conf), requestId);
        if (result.status != QuizCoreRpcStatus::kOk) {
          cb(jsonError(mapRpcStatusToHttp(result.status), "bot_list_failed"));
          return;
        }

        Json::Value r;
        for (const auto& bot : result.bots) r["bots"].append(botToJson(bot));
        cb(jsonOk(r));
      },
      {drogon::Get});

  // DELETE /api/v1/bots/{botId}
  drogon::app().registerHandler(
      "/api/v1/bots/{1}",
      [&quizCore, conf](const drogon::HttpRequestPtr& req, std::function<void(const drogon::HttpResponsePtr&)>&& cb, std::string botId) {
        const auto requestId = requestIdFromRequest(req);
        const auto result = quizCore.removeBot(resolveUserId(req, conf), botId, requestId);
        if (result.status != QuizCoreRpcStatus::kOk) {
          cb(jsonError(mapRpcStatusToHttp(result.status), "bot_remove_failed"));
          return;
        }
        if (!result.removed) { cb(jsonError(404, "bot_not_found")); return; }

        auto resp = drogon::HttpResponse::newHttpResponse();
        resp->setStatusCode(drogon::k204NoContent);
        cb(resp);
      },
      {drogon::Delete});

  // GET /api/v1/bots/{botId}
  drogon::app().registerHandler(
      "/api/v1/bots/{1}",
      [&quizCore, conf](const drogon::HttpRequestPtr& req, std::function<void(const drogon::HttpResponsePtr&)>&& cb, std::string botId) {
        const auto requestId = requestIdFromRequest(req);
        const auto result = quizCore.getBotStatus(resolveUserId(req, conf), botId, requestId);
        if (!result.bot) {
          cb(jsonError(mapRpcStatusToHttp(result.status), "bot_get_failed"));
          return;
        }

        Json::Value r;
        r["bot"] = botToJson(*result.bot);
        cb(jsonOk(r));
      },
      {drogon::Get});

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