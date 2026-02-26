#pragma once

#include <drogon/drogon.h>

#include <string>

#include "config.hpp"
#include "quizcore_client.hpp"

namespace controllers {

std::string requestIdFromRequest(const drogon::HttpRequestPtr& req);
std::string resolveUserId(const drogon::HttpRequestPtr& req, const Config& conf);
Json::Value botToJson(const QuizCoreBot& bot);
drogon::HttpResponsePtr notImplemented(const std::string& endpoint);

}  // namespace controllers
