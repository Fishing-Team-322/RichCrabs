#include "controllers/ProfileController.hpp"

#include <drogon/drogon.h>

#include "controllers/ControllerUtils.hpp"
#include "http_api_utils.hpp"

namespace controllers {

void RegisterProfileRoutes(const Config&) {
  drogon::app().registerHandler(
      "/api/v1/me",
      [](const drogon::HttpRequestPtr&, std::function<void(const drogon::HttpResponsePtr&)>&& cb) {
        cb(notImplemented("GET /api/v1/me"));
      },
      {drogon::Get});

  drogon::app().registerHandler(
      "/api/v1/me",
      [](const drogon::HttpRequestPtr&, std::function<void(const drogon::HttpResponsePtr&)>&& cb) {
        cb(notImplemented("PATCH /api/v1/me"));
      },
      {drogon::Patch});

  drogon::app().registerHandler(
      "/api/v1/me/password",
      [](const drogon::HttpRequestPtr&, std::function<void(const drogon::HttpResponsePtr&)>&& cb) {
        cb(notImplemented("POST /api/v1/me/password"));
      },
      {drogon::Post});
}

}  // namespace controllers
