#include "controllers/ControllerUtils.hpp"

#include <random>

#include "csrf.hpp"
#include "http_api_utils.hpp"
#include "session.hpp"

namespace {

std::string generateRequestId() {
  static constexpr char kHex[] = "0123456789abcdef";
  static thread_local std::mt19937_64 rng{std::random_device{}()};
  std::uniform_int_distribution<uint64_t> dist(0, 0xffffffffffffffffULL);

  auto toHex = [&](uint64_t value) {
    std::string out(16, '0');
    for (int i = 15; i >= 0; --i) {
      out[i] = kHex[value & 0xF];
      value >>= 4;
    }
    return out;
  };

  return toHex(dist(rng)) + toHex(dist(rng));
}

}  // namespace

namespace controllers {

std::string requestIdFromRequest(const drogon::HttpRequestPtr& req) {
  const auto incoming = req->getHeader("x-request-id");
  return incoming.empty() ? generateRequestId() : incoming;
}

std::string resolveUserId(const drogon::HttpRequestPtr& req, const Config& conf) {
  auto session = security::VerifySessionFromRequest(req, conf.session);
  if (session && session->role == "host" && !session->user_id.empty()) return session->user_id;
  return conf.default_user_id;
}

Json::Value botToJson(const QuizCoreBot& bot) {
  Json::Value out;
  out["botId"] = bot.bot_id;
  out["name"] = bot.name;
  out["version"] = bot.version;
  out["status"] = bot.status;
  out["registeredAt"] = static_cast<Json::Int64>(bot.registered_at);
  return out;
}

drogon::HttpResponsePtr notImplemented(const std::string& endpoint) {
  return api::jsonErrorResponse(501, "not_implemented", endpoint + " is not implemented");
}

}  // namespace controllers
