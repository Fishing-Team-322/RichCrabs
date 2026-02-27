#include "controllers/BotsController.hpp"

#include <drogon/drogon.h>

#include "controllers/ControllerUtils.hpp"
#include "http_api_utils.hpp"

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
        const auto entitlement = entitlementsClient.checkAndConsume(resolveUserId(req, conf), "REGISTER_BOT");
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
        auto result = quizCore.registerBot(resolveUserId(req, conf), *name, *version, *endpoint, requestId);
        if (!result.bot) {
          cb(api::jsonErrorResponse(api::mapRpcError(result.status, "register_bot", result.error_code, result.error_message)));
          return;
        }

        Json::Value responseBody;
        responseBody["bot"] = botToJson(*result.bot);
        cb(drogon::HttpResponse::newHttpJsonResponse(responseBody));
      },
      {drogon::Post});

  drogon::app().registerHandler(
      "/api/v1/bots",
      [&quizCore, conf](const drogon::HttpRequestPtr& req, std::function<void(const drogon::HttpResponsePtr&)>&& cb) {
        const auto requestId = requestIdFromRequest(req);
        auto result = quizCore.listBots(resolveUserId(req, conf), requestId);
        if (result.status != QuizCoreRpcStatus::kOk) {
          cb(api::jsonErrorResponse(api::mapRpcError(result.status, "list_bots", result.error_code, result.error_message)));
          return;
        }

        Json::Value responseBody;
        for (const auto& bot : result.bots) {
          responseBody["bots"].append(botToJson(bot));
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
        auto result = quizCore.getBotStatus(resolveUserId(req, conf), botId, requestId);
        if (!result.bot) {
          cb(api::jsonErrorResponse(api::mapRpcError(result.status, "get_bot_status", result.error_code, result.error_message)));
          return;
        }

        Json::Value responseBody;
        responseBody["bot"] = botToJson(*result.bot);
        cb(drogon::HttpResponse::newHttpJsonResponse(responseBody));
      },
      {drogon::Get});

  drogon::app().registerHandler(
      "/api/v1/bots/{1}",
      [conf](const drogon::HttpRequestPtr& req, std::function<void(const drogon::HttpResponsePtr&)>&& cb, std::string) {
        if (!RequireCsrf(req, conf, cb)) return;
        cb(notImplemented("PATCH /api/v1/bots/{botId}"));
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
