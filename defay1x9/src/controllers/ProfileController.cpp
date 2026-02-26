#include "controllers/ProfileController.hpp"

#include <drogon/drogon.h>

#include "controllers/ControllerUtils.hpp"
#include "http_api_utils.hpp"

namespace controllers {

void RegisterProfileRoutes(const Config& conf) {
  drogon::app().registerHandler(
      "/api/v1/me",
      [](const drogon::HttpRequestPtr&, std::function<void(const drogon::HttpResponsePtr&)>&& cb) {
        cb(notImplemented("GET /api/v1/me"));
      },
      {drogon::Get});

  drogon::app().registerHandler(
      "/api/v1/me",
      [conf](const drogon::HttpRequestPtr& req, std::function<void(const drogon::HttpResponsePtr&)>&& cb) {
        if (!RequireCsrf(req, conf, cb)) return;

        std::string parseError;
        auto body = api::parseJsonBody(req, parseError);
        if (!body) {
          cb(api::jsonErrorResponse(400, api::ErrorCode::kInvalidJson, parseError));
          return;
        }

        api::JsonValidator validator(*body);
        validator.optionalString("displayName");
        validator.optionalString("avatarUrl");
        validator.requireAtLeastOne({"displayName", "avatarUrl"}, "required");
        if (!validator.ok()) {
          cb(api::validationErrorResponse(validator.issues()));
          return;
        }

        cb(notImplemented("PATCH /api/v1/me"));
      },
      {drogon::Patch});

  drogon::app().registerHandler(
      "/api/v1/me/password",
      [conf](const drogon::HttpRequestPtr& req, std::function<void(const drogon::HttpResponsePtr&)>&& cb) {
        if (!RequireCsrf(req, conf, cb)) return;

        std::string parseError;
        auto body = api::parseJsonBody(req, parseError);
        if (!body) {
          cb(api::jsonErrorResponse(400, api::ErrorCode::kInvalidJson, parseError));
          return;
        }

        api::JsonValidator validator(*body);
        validator.requiredString("currentPassword");
        validator.requiredString("newPassword");
        if (!validator.ok()) {
          cb(api::validationErrorResponse(validator.issues()));
          return;
        }

        cb(notImplemented("POST /api/v1/me/password"));
      },
      {drogon::Post});
}

}  // namespace controllers
