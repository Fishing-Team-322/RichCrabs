#include "controllers/AdminController.hpp"

#include <drogon/drogon.h>

#include "controllers/ControllerUtils.hpp"

namespace controllers {

void RegisterAdminRoutes() {
  drogon::app().registerHandler(
      "/admin/api/stats",
      [](const drogon::HttpRequestPtr&, std::function<void(const drogon::HttpResponsePtr&)>&& cb) {
        cb(notImplemented("GET /admin/api/stats"));
      },
      {drogon::Get});

  drogon::app().registerHandler(
      "/admin/api/users/{1}/ban",
      [](const drogon::HttpRequestPtr&, std::function<void(const drogon::HttpResponsePtr&)>&& cb, std::string) {
        cb(notImplemented("POST /admin/api/users/{userId}/ban"));
      },
      {drogon::Post});

  drogon::app().registerHandler(
      "/admin/api/users/{1}/unban",
      [](const drogon::HttpRequestPtr&, std::function<void(const drogon::HttpResponsePtr&)>&& cb, std::string) {
        cb(notImplemented("POST /admin/api/users/{userId}/unban"));
      },
      {drogon::Post});

  drogon::app().registerHandler(
      "/admin/api/bots/{1}/disable",
      [](const drogon::HttpRequestPtr&, std::function<void(const drogon::HttpResponsePtr&)>&& cb, std::string) {
        cb(notImplemented("POST /admin/api/bots/{botId}/disable"));
      },
      {drogon::Post});
}

}  // namespace controllers
