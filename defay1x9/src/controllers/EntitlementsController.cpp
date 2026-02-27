#include "controllers/EntitlementsController.hpp"

#include <drogon/drogon.h>

#include "controllers/ControllerUtils.hpp"
#include "http_api_utils.hpp"

namespace controllers {

void RegisterEntitlementsRoutes(const Config& conf, EntitlementsClient& entitlementsClient) {
  drogon::app().registerHandler(
      "/api/v1/entitlements",
      [&entitlementsClient, conf](const drogon::HttpRequestPtr& req, std::function<void(const drogon::HttpResponsePtr&)>&& cb) {
        EntitlementsClientError error;
        std::string userId;
        if (!RequireUserId(req, conf, cb, userId)) return;
        const auto snapshot = entitlementsClient.getEntitlements(userId, error);
        if (!snapshot) {
          cb(api::jsonErrorResponse(error.gateway_error));
          return;
        }

        Json::Value body;
        for (const auto& [name, limit] : snapshot->limits) {
          Json::Value row;
          row["limit"] = limit.limit;
          row["used"] = Json::UInt64(limit.used);
          row["max"] = Json::UInt64(limit.max);
          if (limit.retry_at.has_value()) row["retryAt"] = *limit.retry_at;
          body["limits"].append(row);
          body["byLimit"][name] = row;
        }

        cb(drogon::HttpResponse::newHttpJsonResponse(body));
      },
      {drogon::Get});

  drogon::app().registerHandler(
      "/api/v1/usage",
      [&entitlementsClient, conf](const drogon::HttpRequestPtr& req, std::function<void(const drogon::HttpResponsePtr&)>&& cb) {
        EntitlementsClientError error;
        std::string userId;
        if (!RequireUserId(req, conf, cb, userId)) return;
        const auto snapshot = entitlementsClient.getUsage(userId, error);
        if (!snapshot) {
          cb(api::jsonErrorResponse(error.gateway_error));
          return;
        }

        Json::Value body;
        for (const auto& [name, used] : snapshot->usage) {
          body["usage"][name] = Json::UInt64(used);
        }
        if (snapshot->period_ends_at.has_value()) body["periodEndsAt"] = *snapshot->period_ends_at;

        cb(drogon::HttpResponse::newHttpJsonResponse(body));
      },
      {drogon::Get});
}

}  // namespace controllers
