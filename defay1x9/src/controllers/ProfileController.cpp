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
        cb(notImplemented("PATCH /api/v1/me"));
      },
      {drogon::Patch});

  drogon::app().registerHandler(
      "/api/v1/me/password",
      [conf](const drogon::HttpRequestPtr& req, std::function<void(const drogon::HttpResponsePtr&)>&& cb) {
        if (!RequireCsrf(req, conf, cb)) return;
        cb(notImplemented("POST /api/v1/me/password"));
      },
      {drogon::Post});
}

}  // namespace controllers
