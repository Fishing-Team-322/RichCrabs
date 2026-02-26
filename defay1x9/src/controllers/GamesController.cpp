#include "controllers/GamesController.hpp"

#include <drogon/drogon.h>
#include <spdlog/spdlog.h>

#include "controllers/ControllerUtils.hpp"
#include "csrf.hpp"
#include "http_api_utils.hpp"
#include "session.hpp"

namespace controllers {

void RegisterGamesRoutes(const Config& conf, QuizCoreClient& quizCore) {
  drogon::app().registerHandler(
      "/api/v1/games",
      [&quizCore, conf](const drogon::HttpRequestPtr& req, std::function<void(const drogon::HttpResponsePtr&)>&& cb) {
        if (!RequireCsrf(req, conf, cb)) return;

        std::string parseError;
        auto body = api::parseJsonBody(req, parseError);
        if (!body) {
          cb(api::jsonErrorResponse(400, api::ErrorCode::kInvalidJson, parseError));
          return;
        }

        api::JsonValidator validator(*body);
        auto ownerUserId = validator.requiredUuid("ownerUserId");
        auto quizId = validator.requiredString("quizId");
        auto title = validator.requiredString("title", "roomTitle");
        if (!validator.ok()) {
          cb(api::validationErrorResponse(validator.issues()));
          return;
        }

        const auto requestId = requestIdFromRequest(req);
        spdlog::info("create_game request_id={} pin=- room_id=- player_id=-", requestId);
        auto out = quizCore.createRoom(*ownerUserId, *quizId, *title, requestId);
        if (!out || out->status != QuizCoreRpcStatus::kOk) {
          const auto status = out ? out->status : QuizCoreRpcStatus::kUnavailable;
          cb(api::jsonErrorResponse(api::mapRpcError(status, "create_room")));
          return;
        }

        security::SessionClaims claims;
        claims.role = "host";
        claims.pin = out->pin;
        claims.room_id = out->room_id;
        claims.user_id = *ownerUserId;

        const std::string sessionToken = security::IssueSessionToken(claims, conf.session.ttl_seconds);
        const std::string csrfToken = security::IssueCsrfToken();

        Json::Value responseBody;
        responseBody["pin"] = out->pin;
        responseBody["inviteToken"] = out->invite_token;
        responseBody["inviteUrl"] = conf.public_base_url + "/invite/" + out->invite_token;
        responseBody["wsUrl"] = conf.public_base_url + "/ws";
        spdlog::info("create_game_ok request_id={} pin={} room_id={} player_id=-", requestId, out->pin, out->room_id);

        auto response = drogon::HttpResponse::newHttpJsonResponse(responseBody);
        security::SetSessionCookie(response, conf.session, sessionToken);
        security::SetCsrfCookie(response, conf.csrf, csrfToken);
        cb(response);
      },
      {drogon::Post});

  drogon::app().registerHandler(
      "/api/v1/games/{1}",
      [](const drogon::HttpRequestPtr&, std::function<void(const drogon::HttpResponsePtr&)>&& cb, std::string) {
        cb(notImplemented("GET /api/v1/games/{pin}"));
      },
      {drogon::Get});

  drogon::app().registerHandler(
      "/api/v1/games/{1}/join",
      [&quizCore, conf](const drogon::HttpRequestPtr& req,
                        std::function<void(const drogon::HttpResponsePtr&)>&& cb,
                        std::string pin) {
        if (!RequireCsrf(req, conf, cb)) return;

        std::string parseError;
        auto body = api::parseJsonBody(req, parseError);
        if (!body) {
          cb(api::jsonErrorResponse(400, api::ErrorCode::kInvalidJson, parseError));
          return;
        }

        api::JsonValidator validator(*body);
        auto name = validator.requiredString("name", "displayName");
        if (!validator.ok()) {
          cb(api::validationErrorResponse(validator.issues()));
          return;
        }

        const auto requestId = requestIdFromRequest(req);
        spdlog::info("join_by_pin request_id={} pin={} room_id=- player_id=-", requestId, pin);
        auto out = quizCore.joinRoomByPin(pin, *name, requestId);
        if (!out || out->status != QuizCoreRpcStatus::kOk) {
          const auto status = out ? out->status : QuizCoreRpcStatus::kUnavailable;
          cb(api::jsonErrorResponse(api::mapRpcError(status, "join_room_by_pin")));
          return;
        }

        security::SessionClaims claims;
        claims.role = "player";
        claims.pin = pin;
        claims.room_id = out->room_id;
        claims.player_id = out->player_id;

        const std::string sessionToken = security::IssueSessionToken(claims, conf.session.ttl_seconds);
        const std::string csrfToken = security::IssueCsrfToken();

        Json::Value responseBody;
        responseBody["playerId"] = out->player_id;
        responseBody["team"] = "A";
        responseBody["role"] = "player";
        responseBody["wsUrl"] = conf.public_base_url + "/ws";
        responseBody["csrfToken"] = csrfToken;
        spdlog::info("join_by_pin_ok request_id={} pin={} room_id={} player_id={}", requestId, pin, out->room_id, out->player_id);

        auto response = drogon::HttpResponse::newHttpJsonResponse(responseBody);
        security::SetSessionCookie(response, conf.session, sessionToken);
        security::SetCsrfCookie(response, conf.csrf, csrfToken);
        cb(response);
      },
      {drogon::Post});

  drogon::app().registerHandler(
      "/api/v1/invites/{1}/join",
      [&quizCore, conf](const drogon::HttpRequestPtr& req,
                        std::function<void(const drogon::HttpResponsePtr&)>&& cb,
                        std::string inviteToken) {
        if (!RequireCsrf(req, conf, cb)) return;

        std::string parseError;
        auto body = api::parseJsonBody(req, parseError);
        if (!body) {
          cb(api::jsonErrorResponse(400, api::ErrorCode::kInvalidJson, parseError));
          return;
        }

        api::JsonValidator validator(*body);
        auto name = validator.requiredString("name", "displayName");
        if (!validator.ok()) {
          cb(api::validationErrorResponse(validator.issues()));
          return;
        }

        const auto requestId = requestIdFromRequest(req);
        spdlog::info("join_by_invite request_id={} pin=- room_id=- player_id=-", requestId);
        auto out = quizCore.joinRoomByInvite(inviteToken, *name, requestId);
        if (!out || out->status != QuizCoreRpcStatus::kOk) {
          const auto status = out ? out->status : QuizCoreRpcStatus::kUnavailable;
          cb(api::jsonErrorResponse(api::mapRpcError(status, "join_room_by_invite")));
          return;
        }

        security::SessionClaims claims;
        claims.role = "player";
        claims.room_id = out->room_id;
        claims.player_id = out->player_id;

        const std::string sessionToken = security::IssueSessionToken(claims, conf.session.ttl_seconds);
        const std::string csrfToken = security::IssueCsrfToken();

        Json::Value responseBody;
        responseBody["playerId"] = out->player_id;
        responseBody["team"] = "A";
        responseBody["role"] = "player";
        responseBody["wsUrl"] = conf.public_base_url + "/ws";
        spdlog::info("join_by_invite_ok request_id={} pin=- room_id={} player_id={}", requestId, out->room_id, out->player_id);

        auto response = drogon::HttpResponse::newHttpJsonResponse(responseBody);
        security::SetSessionCookie(response, conf.session, sessionToken);
        security::SetCsrfCookie(response, conf.csrf, csrfToken);
        cb(response);
      },
      {drogon::Post});

  drogon::app().registerHandler(
      "/api/v1/games/{1}/start",
      [&quizCore, conf](const drogon::HttpRequestPtr& req,
                        std::function<void(const drogon::HttpResponsePtr&)>&& cb,
                        std::string) {
        const auto requestId = requestIdFromRequest(req);
        auto session = security::VerifySessionFromRequest(req, conf.session);
        if (!session) {
          cb(api::jsonErrorResponse(401, api::ErrorCode::kUnauthorized, "session cookie is missing or invalid"));
          return;
        }
        if (session->role != "host") {
          cb(api::jsonErrorResponse(403, api::ErrorCode::kForbidden, "only host can start game"));
          return;
        }
        if (!RequireCsrf(req, conf, cb)) return;
        if (session->room_id.empty()) {
          cb(api::jsonErrorResponse(403, api::ErrorCode::kForbidden, "room_id is not present in session"));
          return;
        }

        spdlog::info("start_game request_id={} pin={} room_id={} player_id=-", requestId, session->pin, session->room_id);
        if (!quizCore.startGame(session->room_id, session->user_id, requestId)) {
          cb(api::jsonErrorResponse(409, api::ErrorCode::kValidationError, "game cannot be started in current state"));
          return;
        }

        auto response = drogon::HttpResponse::newHttpResponse();
        response->setStatusCode(drogon::k204NoContent);
        cb(response);
      },
      {drogon::Post});

  drogon::app().registerHandler(
      "/api/v1/games/{1}/state",
      [&quizCore, conf](const drogon::HttpRequestPtr& req,
                        std::function<void(const drogon::HttpResponsePtr&)>&& cb,
                        std::string pin) {
        auto session = security::VerifySessionFromRequest(req, conf.session);
        if (!session) {
          cb(api::jsonErrorResponse(401, api::ErrorCode::kUnauthorized, "session cookie is missing or invalid"));
          return;
        }
        if (session->room_id.empty()) {
          cb(api::jsonErrorResponse(403, api::ErrorCode::kForbidden, "room_id is not present in session"));
          return;
        }

        const auto requestId = requestIdFromRequest(req);
        auto state = quizCore.getRoomState(session->room_id, requestId);
        if (!state) {
          cb(api::jsonErrorResponse(api::mapRpcError(QuizCoreRpcStatus::kUnavailable, "get_room_state")));
          return;
        }

        Json::Value body;
        body["pin"] = pin;
        body["state"] = state->state;
        for (const auto& player : state->players) {
          Json::Value row;
          row["playerId"] = player.player_id;
          row["name"] = player.display_name;
          row["score"] = player.score;
          body["players"].append(row);
        }
        cb(drogon::HttpResponse::newHttpJsonResponse(body));
      },
      {drogon::Get});

  drogon::app().registerHandler(
      "/api/v1/games/{1}/leave",
      [conf](const drogon::HttpRequestPtr& req, std::function<void(const drogon::HttpResponsePtr&)>&& cb, std::string) {
        if (!RequireCsrf(req, conf, cb)) return;
        cb(notImplemented("POST /api/v1/games/{pin}/leave"));
      },
      {drogon::Post});

  drogon::app().registerHandler(
      "/api/v1/games/{1}/kick",
      [conf](const drogon::HttpRequestPtr& req, std::function<void(const drogon::HttpResponsePtr&)>&& cb, std::string) {
        if (!RequireCsrf(req, conf, cb)) return;
        cb(notImplemented("POST /api/v1/games/{pin}/kick"));
      },
      {drogon::Post});
}

}  // namespace controllers
