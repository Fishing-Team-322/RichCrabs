#include "controllers/BotsController.hpp"

#include <drogon/drogon.h>

#include <ctime>

#include "controllers/BotStateStorage.hpp"
#include "controllers/ControllerUtils.hpp"
#include "http_api_utils.hpp"

namespace {

std::optional<bool> optionalBoolField(api::JsonValidator& validator, const Json::Value& body, const std::string& field) {
  if (!body.isMember(field)) return std::nullopt;
  if (!body[field].isBool()) {
    validator.addIssue(field, "type_mismatch");
    return std::nullopt;
  }
  return body[field].asBool();
}

std::optional<Json::Value> optionalObjectField(api::JsonValidator& validator, const Json::Value& body, const std::string& field) {
  if (!body.isMember(field)) return std::nullopt;
  if (!body[field].isObject()) {
    validator.addIssue(field, "type_mismatch");
    return std::nullopt;
  }
  return body[field];
}

}  // namespace

namespace controllers {

void RegisterBotsRoutes(const Config& conf, QuizCoreClient& quizCore, EntitlementsClient& entitlementsClient) {
  drogon::app().registerHandler(
      "/api/v1/bots",
      [&quizCore, &entitlementsClient, conf](const drogon::HttpRequestPtr& req, std::function<void(const drogon::HttpResponsePtr&)>&& cb) {
        if (!RequireCsrf(req, conf, cb)) return;

        std::string parseError;
        auto body = api::parseJsonBody(req, parseError);
        if (!body) {
          cb(api::jsonErrorResponse(400, api::ErrorCode::kInvalidJson, parseError));
          return;
        }

        api::JsonValidator validator(*body);
        auto name = validator.requiredString("name");
        auto version = validator.requiredString("version");
        auto endpoint = validator.requiredString("endpoint");
        if (!validator.ok()) {
          cb(api::validationErrorResponse(validator.issues()));
          return;
        }
        const auto userId = resolveUserId(req, conf);
        const auto entitlement = entitlementsClient.checkAndConsume(userId, "REGISTER_BOT");
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
        auto result = quizCore.registerBot(userId, *name, *version, *endpoint, requestId);
        if (!result.bot) {
          cb(api::jsonErrorResponse(api::mapRpcError(result.status, "register_bot", result.error_code, result.error_message)));
          return;
        }

        std::string stateError;
        SeedBotStateOwner(conf, result.bot->bot_id, userId, result.bot->name, stateError);
        auto state = GetBotState(conf, result.bot->bot_id, stateError);

        Json::Value responseBody;
        responseBody["bot"] = botToJson(*result.bot, state);
        cb(drogon::HttpResponse::newHttpJsonResponse(responseBody));
      },
      {drogon::Post});

  drogon::app().registerHandler(
      "/api/v1/bots",
      [&quizCore, conf](const drogon::HttpRequestPtr& req, std::function<void(const drogon::HttpResponsePtr&)>&& cb) {
        const auto requestId = requestIdFromRequest(req);
        const auto userId = resolveUserId(req, conf);
        auto result = quizCore.listBots(userId, requestId);
        if (result.status != QuizCoreRpcStatus::kOk) {
          cb(api::jsonErrorResponse(api::mapRpcError(result.status, "list_bots", result.error_code, result.error_message)));
          return;
        }

        Json::Value responseBody;
        std::string stateError;
        for (const auto& bot : result.bots) {
          SeedBotStateOwner(conf, bot.bot_id, userId, bot.name, stateError);
          auto state = GetBotState(conf, bot.bot_id, stateError);
          responseBody["bots"].append(botToJson(bot, state));
        }
        cb(drogon::HttpResponse::newHttpJsonResponse(responseBody));
      },
      {drogon::Get});

  drogon::app().registerHandler(
      "/api/v1/bots/{1}",
      [&quizCore, conf](const drogon::HttpRequestPtr& req,
                        std::function<void(const drogon::HttpResponsePtr&)>&& cb,
                        std::string botId) {
        const auto requestId = requestIdFromRequest(req);
        const auto userId = resolveUserId(req, conf);
        auto result = quizCore.getBotStatus(userId, botId, requestId);
        if (!result.bot) {
          cb(api::jsonErrorResponse(api::mapRpcError(result.status, "get_bot_status", result.error_code, result.error_message)));
          return;
        }

        std::string stateError;
        SeedBotStateOwner(conf, botId, userId, result.bot->name, stateError);
        auto state = GetBotState(conf, botId, stateError);

        Json::Value responseBody;
        responseBody["bot"] = botToJson(*result.bot, state);
        cb(drogon::HttpResponse::newHttpJsonResponse(responseBody));
      },
      {drogon::Get});

  drogon::app().registerHandler(
      "/api/v1/bots/{1}",
      [&quizCore, conf](const drogon::HttpRequestPtr& req,
                        std::function<void(const drogon::HttpResponsePtr&)>&& cb,
                        std::string botId) {
        if (!RequireCsrf(req, conf, cb)) return;

        std::string parseError;
        auto body = api::parseJsonBody(req, parseError);
        if (!body) {
          cb(api::jsonErrorResponse(400, api::ErrorCode::kInvalidJson, parseError));
          return;
        }

        api::JsonValidator validator(*body);
        auto name = validator.optionalString("name");
        auto enabled = optionalBoolField(validator, *body, "enabled");
        auto metadata = optionalObjectField(validator, *body, "metadata");
        validator.requireAtLeastOne({"name", "enabled", "metadata"});
        if (!validator.ok()) {
          cb(api::validationErrorResponse(validator.issues()));
          return;
        }

        const auto requestId = requestIdFromRequest(req);
        const auto userId = resolveUserId(req, conf);

        QuizCoreBot baseBot;
        bool hasBaseBot = false;
        auto getResult = quizCore.getBotStatus(userId, botId, requestId);
        if (getResult.bot) {
          baseBot = *getResult.bot;
          hasBaseBot = true;
        } else if (getResult.status == QuizCoreRpcStatus::kNotFound) {
          // allow temporary persistence-only bots
        } else if (getResult.status == QuizCoreRpcStatus::kPermissionDenied) {
          cb(api::jsonErrorResponse(403, api::ErrorCode::kForbidden, "forbidden: bot belongs to another user"));
          return;
        } else if (getResult.status == QuizCoreRpcStatus::kFailedPrecondition) {
          cb(api::jsonErrorResponse(409, api::ErrorCode::kValidationError, "bot update conflict"));
          return;
        } else {
          cb(api::jsonErrorResponse(api::mapRpcError(getResult.status, "get_bot_status", getResult.error_code, getResult.error_message)));
          return;
        }

        std::string stateError;
        auto state = GetBotState(conf, botId, stateError);
        if (stateError.empty() && state && state->owner_user_id != userId) {
          cb(api::jsonErrorResponse(403, api::ErrorCode::kForbidden, "forbidden: bot belongs to another user"));
          return;
        }

        if (!hasBaseBot && (!state || !stateError.empty())) {
          cb(api::jsonErrorResponse(404, api::ErrorCode::kNotFound, "bot not found"));
          return;
        }

        BotState updated;
        bool conflict = false;
        if (!UpsertBotStatePatch(conf, botId, userId, name, enabled, metadata, updated, stateError, conflict)) {
          if (conflict) {
            cb(api::jsonErrorResponse(409, api::ErrorCode::kValidationError, "bot update conflict"));
          } else {
            cb(api::jsonErrorResponse(503, api::ErrorCode::kGrpcUnavailable, "bot state storage is unavailable"));
          }
          return;
        }

        if (!hasBaseBot) {
          baseBot.bot_id = botId;
          baseBot.name = updated.name.value_or("Bot");
          baseBot.version = "n/a";
          baseBot.status = updated.enabled ? "active" : "disabled";
          baseBot.registered_at = std::time(nullptr);
        }

        Json::Value responseBody;
        responseBody["bot"] = botToJson(baseBot, updated);
        cb(drogon::HttpResponse::newHttpJsonResponse(responseBody));
      },
      {drogon::Patch});

  drogon::app().registerHandler(
      "/api/v1/bots/{1}",
      [&quizCore, conf](const drogon::HttpRequestPtr& req,
                        std::function<void(const drogon::HttpResponsePtr&)>&& cb,
                        std::string botId) {
        if (!RequireCsrf(req, conf, cb)) return;

        const auto requestId = requestIdFromRequest(req);
        auto result = quizCore.removeBot(resolveUserId(req, conf), botId, requestId);
        if (result.status != QuizCoreRpcStatus::kOk) {
          cb(api::jsonErrorResponse(api::mapRpcError(result.status, "remove_bot", result.error_code, result.error_message)));
          return;
        }
        if (!result.removed) {
          cb(api::jsonErrorResponse(404, api::ErrorCode::kNotFound, "bot_id does not exist"));
          return;
        }

        auto response = drogon::HttpResponse::newHttpResponse();
        response->setStatusCode(drogon::k204NoContent);
        cb(response);
      },
      {drogon::Delete});
}

}  // namespace controllers
