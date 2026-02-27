#pragma once

#include <drogon/drogon.h>

#include <functional>
#include <optional>
#include <string>

#include "config.hpp"
#include "controllers/BotStateStorage.hpp"
#include "quizcore_client.hpp"

namespace controllers {

std::string requestIdFromRequest(const drogon::HttpRequestPtr& req);
std::string clientIpFromRequest(const drogon::HttpRequestPtr& req);
std::optional<std::string> resolveUserId(const drogon::HttpRequestPtr& req, const Config& conf);
bool RequireUserId(const drogon::HttpRequestPtr& req,
                   const Config& conf,
                   const std::function<void(const drogon::HttpResponsePtr&)>& cb,
                   std::string& userIdOut);
Json::Value botToJson(const QuizCoreBot& bot, const std::optional<BotState>& state = std::nullopt);
drogon::HttpResponsePtr notImplemented(const std::string& endpoint);
bool RequireCsrf(const drogon::HttpRequestPtr& req,
                 const Config& conf,
                 const std::function<void(const drogon::HttpResponsePtr&)>& cb);
drogon::HttpResponsePtr CsrfTokenResponse(const Config& conf);

}  // namespace controllers
