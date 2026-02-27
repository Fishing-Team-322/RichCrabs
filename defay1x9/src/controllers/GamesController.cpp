#include "controllers/GamesController.hpp"

#include <drogon/drogon.h>
#include <spdlog/spdlog.h>

#include <vector>

#include "controllers/ControllerUtils.hpp"
#include "csrf.hpp"
#include "http_api_utils.hpp"
#include "redis_utils.hpp"
#include "session.hpp"

namespace controllers {

namespace {

constexpr uint64_t kRateLimitJoinPerIp = 40;
constexpr uint64_t kRateLimitJoinByPin = 25;
constexpr uint64_t kRateLimitJoinByInvite = 25;
constexpr uint64_t kRateLimitCreatePerIp = 20;
constexpr uint64_t kRateLimitCreatePerUser = 10;
constexpr uint64_t kRateLimitWindowSec = 60;

bool AllowRateLimit(const Config& conf,
                    const std::vector<std::string>& keys,
                    uint64_t limit,
                    const std::function<void(const drogon::HttpResponsePtr&)>& cb) {
  for (const auto& key : keys) {
    const auto decision = RedisAllowFixedWindow(conf.redis_url, key, limit, kRateLimitWindowSec);
    if (!decision.has_value()) continue;
    if (!decision->allowed) {
      Json::Value details;
      details["scope"] = key;
      details["limit"] = static_cast<Json::UInt64>(decision->limit);
      details["count"] = static_cast<Json::UInt64>(decision->current);
      cb(api::jsonErrorResponse(429, api::ErrorCode::kTooManyAttempts, "rate limit exceeded", details));
      return false;
    }
  }
  return true;
}

bool ValidateSessionPin(const security::SessionClaims& session,
                        const std::string& pathPin,
                        const std::function<void(const drogon::HttpResponsePtr&)>& cb) {
  if (!session.pin.empty() && pathPin != session.pin) {
    cb(api::jsonErrorResponse(403,
                              api::ErrorCode::kForbidden,
                              "path pin does not match active game session pin"));
    return false;
  }
  return true;
}

}  // namespace

void RegisterGamesRoutes(const Config& conf, QuizCoreClient& quizCore, EntitlementsClient& entitlementsClient) {
  drogon::app().registerHandler(
      "/api/v1/games",
      [&quizCore, &entitlementsClient, conf](const drogon::HttpRequestPtr& req, std::function<void(const drogon::HttpResponsePtr&)>&& cb) {
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

        std::string sessionUserId;
        if (!RequireUserId(req, conf, cb, sessionUserId)) return;
        if (*ownerUserId != sessionUserId) {
          cb(api::jsonErrorResponse(403, api::ErrorCode::kForbidden, "ownerUserId must match host session"));
          return;
        }

        const auto ip = clientIpFromRequest(req);
        if (!AllowRateLimit(conf,
                            {"rl:create_game:ip:" + ip},
                            kRateLimitCreatePerIp,
                            cb)) {
          return;
        }
        if (!AllowRateLimit(conf,
                            {"rl:create_game:user:" + *ownerUserId},
                            kRateLimitCreatePerUser,
                            cb)) {
          return;
        }

        const auto entitlement = entitlementsClient.checkAndConsume(*ownerUserId, "CREATE_ROOM");
        if (!entitlement.allowed) {
          Json::Value details;
          details["error"] = "limit_exceeded";
          if (entitlement.error->limit.has_value()) details["limit"] = *entitlement.error->limit;
          if (entitlement.error->retry_at.has_value()) details["retryAt"] = *entitlement.error->retry_at;
          cb(api::jsonErrorResponse(429,
                                    api::ErrorCode::kTooManyAttempts,
                                    entitlement.error->gateway_error.message,
                                    details));
          return;
        }
        const auto requestId = requestIdFromRequest(req);
        spdlog::info("create_game request_id={} pin=- room_id=- player_id=-", requestId);
        auto out = quizCore.createRoom(*ownerUserId, *quizId, *title, requestId);
        if (!out || out->status != QuizCoreRpcStatus::kOk) {
          const auto status = out ? out->status : QuizCoreRpcStatus::kUnavailable;
          cb(api::jsonErrorResponse(
              api::mapRpcError(status, "create_room", out ? out->error_code : "", out ? out->error_message : "")));
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
        if (!ValidateSessionPin(*session, pin, cb)) return;

        const auto requestId = requestIdFromRequest(req);
        auto state = quizCore.getRoomState(session->room_id, requestId);
        if (!state.room_state) {
          cb(api::jsonErrorResponse(api::mapRpcError(state.status, "get_room_state", state.error_code, state.error_message)));
          return;
        }

        Json::Value body;
        body["pin"] = pin;
        body["state"] = state.room_state->state;
        for (const auto& player : state.room_state->players) {
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

        const auto ip = clientIpFromRequest(req);
        if (!AllowRateLimit(conf,
                            {"rl:join:ip:" + ip, "rl:join:pin:" + pin},
                            kRateLimitJoinPerIp,
                            cb)) {
          return;
        }
        if (!AllowRateLimit(conf,
                            {"rl:join_by_pin:pin:" + pin},
                            kRateLimitJoinByPin,
                            cb)) {
          return;
        }

        const auto requestId = requestIdFromRequest(req);
        spdlog::info("join_by_pin request_id={} pin={} room_id=- player_id=-", requestId, pin);
        auto out = quizCore.joinRoomByPin(pin, *name, requestId);
        if (!out || out->status != QuizCoreRpcStatus::kOk) {
          const auto status = out ? out->status : QuizCoreRpcStatus::kUnavailable;
          cb(api::jsonErrorResponse(api::mapRpcError(
              status, "join_room_by_pin", out ? out->error_code : "", out ? out->error_message : "")));
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
        responseBody["joinTicket"] = sessionToken;
        responseBody["expiresInSec"] = conf.session.ttl_seconds;
        responseBody["roomPin"] = pin;
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

        const auto ip = clientIpFromRequest(req);
        if (!AllowRateLimit(conf,
                            {"rl:join:ip:" + ip, "rl:join:token:" + inviteToken},
                            kRateLimitJoinPerIp,
                            cb)) {
          return;
        }
        if (!AllowRateLimit(conf,
                            {"rl:join_by_invite:token:" + inviteToken},
                            kRateLimitJoinByInvite,
                            cb)) {
          return;
        }

        const auto requestId = requestIdFromRequest(req);
        spdlog::info("join_by_invite request_id={} pin=- room_id=- player_id=-", requestId);
        auto out = quizCore.joinRoomByInvite(inviteToken, *name, requestId);
        if (!out || out->status != QuizCoreRpcStatus::kOk) {
          const auto status = out ? out->status : QuizCoreRpcStatus::kUnavailable;
          cb(api::jsonErrorResponse(api::mapRpcError(
              status, "join_room_by_invite", out ? out->error_code : "", out ? out->error_message : "")));
          return;
        }

        security::SessionClaims claims;
        claims.role = "player";
        claims.pin = out->room_id;
        claims.room_id = out->room_id;
        claims.player_id = out->player_id;

        const std::string sessionToken = security::IssueSessionToken(claims, conf.session.ttl_seconds);
        const std::string csrfToken = security::IssueCsrfToken();

        Json::Value responseBody;
        responseBody["playerId"] = out->player_id;
        responseBody["joinTicket"] = sessionToken;
        responseBody["expiresInSec"] = conf.session.ttl_seconds;
        responseBody["roomPin"] = "";
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
      "/api/v1/presence/{1}",
      [conf](const drogon::HttpRequestPtr& req,
             std::function<void(const drogon::HttpResponsePtr&)>&& cb,
             std::string actorId) {
        auto session = security::VerifySessionFromRequest(req, conf.session);
        if (!session || session->room_id.empty()) {
          cb(api::jsonErrorResponse(401, api::ErrorCode::kUnauthorized, "session cookie is missing or invalid"));
          return;
        }
        Json::Value out;
        out["roomId"] = session->room_id;
        out["actorId"] = actorId;
        out["online"] = RedisIsPresenceOnline(conf.redis_url, session->room_id, actorId);
        cb(drogon::HttpResponse::newHttpJsonResponse(out));
      },
      {drogon::Get});

  drogon::app().registerHandler(
      "/api/v1/games/{1}/start",
      [&quizCore, conf](const drogon::HttpRequestPtr& req,
                        std::function<void(const drogon::HttpResponsePtr&)>&& cb,
                        std::string pin) {
        const auto requestId = requestIdFromRequest(req);
        std::string hostUserId;
        if (!RequireUserId(req, conf, cb, hostUserId)) return;
        auto session = security::VerifySessionFromRequest(req, conf.session);
        if (!session) {
          cb(api::jsonErrorResponse(401, api::ErrorCode::kUnauthorized, "session cookie is missing or invalid"));
          return;
        }
        if (!RequireCsrf(req, conf, cb)) return;
        if (session->room_id.empty()) {
          cb(api::jsonErrorResponse(403, api::ErrorCode::kForbidden, "room_id is not present in session"));
          return;
        }
        if (!ValidateSessionPin(*session, pin, cb)) return;

        spdlog::info("start_game request_id={} pin={} room_id={} player_id=-", requestId, session->pin, session->room_id);
        const auto result = quizCore.startGame(session->room_id, hostUserId, requestId);
        if (result.status != QuizCoreRpcStatus::kOk) {
          cb(api::jsonErrorResponse(api::mapRpcError(result.status, "start_game", result.error_code, result.error_message)));
          return;
        }
        if (!result.started) {
          cb(api::jsonErrorResponse(api::mapRpcError(
              QuizCoreRpcStatus::kFailedPrecondition,
              "start_game",
              "FAILED_PRECONDITION",
              "game cannot be started in current state")));
          return;
        }

        auto response = drogon::HttpResponse::newHttpResponse();
        response->setStatusCode(drogon::k204NoContent);
        cb(response);
      },
      {drogon::Post});


  drogon::app().registerHandler(
      "/api/v1/games/{1}/pause",
      [&quizCore, conf](const drogon::HttpRequestPtr& req,
                        std::function<void(const drogon::HttpResponsePtr&)>&& cb,
                        std::string pin) {
        std::string hostUserId;
        if (!RequireUserId(req, conf, cb, hostUserId)) return;
        auto session = security::VerifySessionFromRequest(req, conf.session);
        if (!session) {
          cb(api::jsonErrorResponse(401, api::ErrorCode::kUnauthorized, "session cookie is missing or invalid"));
          return;
        }
        if (session->room_id.empty()) {
          cb(api::jsonErrorResponse(403, api::ErrorCode::kForbidden, "room_id is not present in session"));
          return;
        }
        if (!ValidateSessionPin(*session, pin, cb)) return;
        if (!RequireCsrf(req, conf, cb)) return;

        const auto requestId = requestIdFromRequest(req);
        const auto result = quizCore.pauseGame(session->room_id, hostUserId, requestId);
        if (result.status != QuizCoreRpcStatus::kOk || !result.paused) {
          cb(api::jsonErrorResponse(api::mapRpcError(result.status, "pause_game")));
          return;
        }

        auto response = drogon::HttpResponse::newHttpResponse();
        response->setStatusCode(drogon::k204NoContent);
        cb(response);
      },
      {drogon::Post});

  drogon::app().registerHandler(
      "/api/v1/games/{1}/resume",
      [&quizCore, conf](const drogon::HttpRequestPtr& req,
                        std::function<void(const drogon::HttpResponsePtr&)>&& cb,
                        std::string pin) {
        std::string hostUserId;
        if (!RequireUserId(req, conf, cb, hostUserId)) return;
        auto session = security::VerifySessionFromRequest(req, conf.session);
        if (!session) {
          cb(api::jsonErrorResponse(401, api::ErrorCode::kUnauthorized, "session cookie is missing or invalid"));
          return;
        }
        if (session->room_id.empty()) {
          cb(api::jsonErrorResponse(403, api::ErrorCode::kForbidden, "room_id is not present in session"));
          return;
        }
        if (!ValidateSessionPin(*session, pin, cb)) return;
        if (!RequireCsrf(req, conf, cb)) return;

        const auto requestId = requestIdFromRequest(req);
        const auto result = quizCore.resumeGame(session->room_id, hostUserId, requestId);
        if (result.status != QuizCoreRpcStatus::kOk || !result.resumed) {
          cb(api::jsonErrorResponse(api::mapRpcError(result.status, "resume_game")));
          return;
        }

        auto response = drogon::HttpResponse::newHttpResponse();
        response->setStatusCode(drogon::k204NoContent);
        cb(response);
      },
      {drogon::Post});

  drogon::app().registerHandler(
      "/api/v1/games/{1}/next",
      [&quizCore, conf](const drogon::HttpRequestPtr& req,
                        std::function<void(const drogon::HttpResponsePtr&)>&& cb,
                        std::string pin) {
        std::string hostUserId;
        if (!RequireUserId(req, conf, cb, hostUserId)) return;
        auto session = security::VerifySessionFromRequest(req, conf.session);
        if (!session) {
          cb(api::jsonErrorResponse(401, api::ErrorCode::kUnauthorized, "session cookie is missing or invalid"));
          return;
        }
        if (session->room_id.empty()) {
          cb(api::jsonErrorResponse(403, api::ErrorCode::kForbidden, "room_id is not present in session"));
          return;
        }
        if (!ValidateSessionPin(*session, pin, cb)) return;
        if (!RequireCsrf(req, conf, cb)) return;

        const auto requestId = requestIdFromRequest(req);
        const auto result = quizCore.nextQuestion(session->room_id, hostUserId, requestId);
        if (result.status != QuizCoreRpcStatus::kOk || !result.advanced) {
          cb(api::jsonErrorResponse(api::mapRpcError(result.status, "next_question")));
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
        if (!ValidateSessionPin(*session, pin, cb)) return;

        const auto requestId = requestIdFromRequest(req);
        auto state = quizCore.getRoomState(session->room_id, requestId);
        if (!state.room_state) {
          cb(api::jsonErrorResponse(api::mapRpcError(state.status, "get_room_state", state.error_code, state.error_message)));
          return;
        }

        Json::Value body;
        body["pin"] = pin;
        body["state"] = state.room_state->state;
        for (const auto& player : state.room_state->players) {
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
      [&quizCore, conf](const drogon::HttpRequestPtr& req,
                        std::function<void(const drogon::HttpResponsePtr&)>&& cb,
                        std::string pin) {
        auto session = security::VerifySessionFromRequest(req, conf.session);
        if (!session) {
          cb(api::jsonErrorResponse(401, api::ErrorCode::kUnauthorized, "session cookie is missing or invalid"));
          return;
        }
        if (session->role != "player") {
          cb(api::jsonErrorResponse(403, api::ErrorCode::kForbidden, "only player can leave game"));
          return;
        }
        if (session->room_id.empty() || session->player_id.empty()) {
          cb(api::jsonErrorResponse(403, api::ErrorCode::kForbidden, "room_id or player_id is not present in session"));
          return;
        }
        if (!ValidateSessionPin(*session, pin, cb)) return;
        if (!RequireCsrf(req, conf, cb)) return;

        const auto requestId = requestIdFromRequest(req);
        auto result = quizCore.leaveRoom(session->room_id, session->player_id, requestId);
        if (result.status != QuizCoreRpcStatus::kOk) {
          cb(api::jsonErrorResponse(api::mapRpcError(result.status, "leave_room")));
          return;
        }
        if (!result.left) {
          cb(api::jsonErrorResponse(api::mapRpcError(QuizCoreRpcStatus::kFailedPrecondition, "leave_room")));
          return;
        }

        auto response = drogon::HttpResponse::newHttpResponse();
        response->setStatusCode(drogon::k204NoContent);
        security::ClearSessionCookie(response, conf.session);
        security::ClearCsrfCookie(response, conf.csrf);
        cb(response);
      },
      {drogon::Post});

  drogon::app().registerHandler(
      "/api/v1/games/{1}/kick",
      [&quizCore, conf](const drogon::HttpRequestPtr& req,
                        std::function<void(const drogon::HttpResponsePtr&)>&& cb,
                        std::string pin) {
        std::string hostUserId;
        if (!RequireUserId(req, conf, cb, hostUserId)) return;
        auto session = security::VerifySessionFromRequest(req, conf.session);
        if (!session) {
          cb(api::jsonErrorResponse(401, api::ErrorCode::kUnauthorized, "session cookie is missing or invalid"));
          return;
        }
        if (session->room_id.empty()) {
          cb(api::jsonErrorResponse(403, api::ErrorCode::kForbidden, "room_id is not present in session"));
          return;
        }
        if (!ValidateSessionPin(*session, pin, cb)) return;
        if (!RequireCsrf(req, conf, cb)) return;

        std::string parseError;
        auto body = api::parseJsonBody(req, parseError);
        if (!body) {
          cb(api::jsonErrorResponse(400, api::ErrorCode::kInvalidJson, parseError));
          return;
        }

        api::JsonValidator validator(*body);
        auto playerId = validator.requiredUuid("playerId");
        if (!validator.ok()) {
          cb(api::validationErrorResponse(validator.issues()));
          return;
        }

        const auto requestId = requestIdFromRequest(req);
        auto result = quizCore.kickPlayer(session->room_id, hostUserId, *playerId, requestId);
        if (result.status != QuizCoreRpcStatus::kOk) {
          cb(api::jsonErrorResponse(api::mapRpcError(result.status, "kick_player")));
          return;
        }
        if (!result.kicked) {
          cb(api::jsonErrorResponse(api::mapRpcError(QuizCoreRpcStatus::kFailedPrecondition, "kick_player")));
          return;
        }

        auto response = drogon::HttpResponse::newHttpResponse();
        response->setStatusCode(drogon::k204NoContent);
        cb(response);
      },
      {drogon::Post});
}

}  // namespace controllers
