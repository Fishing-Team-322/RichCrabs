#include <drogon/drogon.h>
#include <spdlog/spdlog.h>

#include <fstream>
#include <sstream>

#include <json/value.h>

#include "config.hpp"
#include "game_manager.hpp"
#include "jwt.hpp"
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

static std::string bearerToken(const drogon::HttpRequestPtr& req) {
  auto h = req->getHeader("Authorization");
  if (h.empty()) h = req->getHeader("authorization");
  const std::string p = "Bearer ";
  if (h.rfind(p, 0) == 0) return h.substr(p.size());
  return {};
}

int main() {
  auto conf = Config::LoadFromEnv();
  spdlog::info("listen {}:{}", conf.listen_host, conf.listen_port);
  spdlog::info("openapi_path={}", conf.openapi_path);

  auto& gm = GameManager::instance();
  gm.setJwt(conf.jwt_secret, conf.jwt_ttl_seconds);
  gm.setPublicBaseUrl(conf.public_base_url);

  // /health
  drogon::app().registerHandler(
    "/health",
    [](const drogon::HttpRequestPtr&, std::function<void(const drogon::HttpResponsePtr&)>&& cb) {
      cb(textResp("ok", drogon::CT_TEXT_PLAIN));
    },
    {drogon::Get}
  );

  // /openapi.yaml
  drogon::app().registerHandler(
    "/openapi.yaml",
    [conf](const drogon::HttpRequestPtr&, std::function<void(const drogon::HttpResponsePtr&)>&& cb) {
      auto y = readFile(conf.openapi_path);
      if (y.empty()) { cb(jsonError(404, "openapi_not_found")); return; }
      cb(textResp(y, drogon::CT_TEXT_PLAIN));
    },
    {drogon::Get}
  );

  // /docs (Swagger UI CDN)
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
    {drogon::Get}
  );

  // POST /api/v1/games
  drogon::app().registerHandler(
    "/api/v1/games",
    [&gm](const drogon::HttpRequestPtr& req, std::function<void(const drogon::HttpResponsePtr&)>&& cb) {
      auto jptr = req->getJsonObject();
      if (!jptr) { cb(jsonError(400, "invalid_json")); return; }

      const auto& body = *jptr;
      const std::string topic = body.get("topic", "").asString();
      const int qpt = body.get("questionsPerTeam", 0).asInt();

      if (topic.empty()) { cb(jsonError(400, "topic_required")); return; }

      auto out = gm.createGame(topic, qpt);

      Json::Value r;
      r["pin"] = out.game.pin;
      r["hostToken"] = out.host_token;
      r["wsUrl"] = gm.makeWsUrl(out.host_token);

      cb(drogon::HttpResponse::newHttpJsonResponse(r));
    },
    {drogon::Post}
  );

  // POST /api/v1/games/{pin}/join
  drogon::app().registerHandler(
    "/api/v1/games/{1}/join",
    [&gm](const drogon::HttpRequestPtr& req, std::function<void(const drogon::HttpResponsePtr&)>&& cb, std::string pin) {
      auto jptr = req->getJsonObject();
      if (!jptr) { cb(jsonError(400, "invalid_json")); return; }

      const std::string name = (*jptr).get("name", "").asString();
      auto outOpt = gm.joinGame(pin, name);
      if (!outOpt) { cb(jsonError(404, "game_not_found_or_closed")); return; }

      const auto& out = *outOpt;

      Json::Value r;
      r["playerId"] = out.player.player_id;
      r["team"] = std::string(1, out.player.team);
      r["playerToken"] = out.player_token;
      r["wsUrl"] = gm.makeWsUrl(out.player_token);

      cb(drogon::HttpResponse::newHttpJsonResponse(r));
    },
    {drogon::Post}
  );

  // POST /api/v1/games/{pin}/start
  drogon::app().registerHandler(
    "/api/v1/games/{1}/start",
    [&gm, conf](const drogon::HttpRequestPtr& req, std::function<void(const drogon::HttpResponsePtr&)>&& cb, std::string pin) {
      auto token = bearerToken(req);
      if (token.empty()) { cb(jsonError(401, "missing_token")); return; }

      auto claimsOpt = security::Verify(conf.jwt_secret, token);
      if (!claimsOpt) { cb(jsonError(401, "invalid_token")); return; }

      auto c = *claimsOpt;
      if (c.role != "host") { cb(jsonError(403, "host_only")); return; }
      if (c.pin != pin) { cb(jsonError(403, "pin_mismatch")); return; }

      if (!gm.startGame(pin, c.subject)) { cb(jsonError(409, "cannot_start")); return; }

      auto r = drogon::HttpResponse::newHttpResponse();
      r->setStatusCode(drogon::k204NoContent);
      cb(r);
    },
    {drogon::Post}
  );

  drogon::app()
    .addListener(conf.listen_host, conf.listen_port)
    .run();

  return 0;
}