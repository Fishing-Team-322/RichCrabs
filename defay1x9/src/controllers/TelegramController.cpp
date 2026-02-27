#include "controllers/TelegramController.hpp"

#include <drogon/drogon.h>
#include <spdlog/spdlog.h>

#include <memory>
#include <mutex>
#include <optional>
#include <regex>
#include <sstream>
#include <string>
#include <unordered_map>

#include "controllers/ControllerUtils.hpp"
#include "controllers/TelegramWebhookClient.hpp"
#include "http_api_utils.hpp"
#include "random.hpp"

namespace {

struct TelegramBotBinding final {
  struct ProtectedToken final {
    std::string key;
    std::string payload;

    static ProtectedToken fromPlain(const std::string& plain) {
      ProtectedToken secured;
      secured.key = util::random_hex(plain.size() + 4);
      secured.payload.resize(plain.size());
      for (size_t i = 0; i < plain.size(); ++i) {
        secured.payload[i] = static_cast<char>(plain[i] ^ secured.key[i % secured.key.size()]);
      }
      return secured;
    }

    std::string reveal() const {
      std::string plain;
      plain.resize(payload.size());
      for (size_t i = 0; i < payload.size(); ++i) {
        plain[i] = static_cast<char>(payload[i] ^ key[i % key.size()]);
      }
      return plain;
    }
  };

  std::string bot_id;
  std::string secret;
  ProtectedToken token;
  std::string owner_user_id;
  std::string name;
};

class TelegramBindings final {
public:
  TelegramBotBinding save(const TelegramBotBinding& binding) {
    std::lock_guard<std::mutex> lock(mu_);
    by_id_[binding.bot_id] = binding;
    return binding;
  }

  std::optional<TelegramBotBinding> get(const std::string& bot_id) const {
    std::lock_guard<std::mutex> lock(mu_);
    auto it = by_id_.find(bot_id);
    if (it == by_id_.end()) return std::nullopt;
    return it->second;
  }

private:
  mutable std::mutex mu_;
  std::unordered_map<std::string, TelegramBotBinding> by_id_;
};

TelegramBindings& bindings() {
  static TelegramBindings s;
  return s;
}

bool isValidTelegramTokenFormat(const std::string& token) {
  static const std::regex kPattern(R"(^[0-9]{6,12}:[A-Za-z0-9_\-]{20,}$)");
  return std::regex_match(token, kPattern);
}

std::string maskToken(const std::string& token) {
  if (token.size() <= 8) return "***";
  return token.substr(0, 4) + "***" + token.substr(token.size() - 4);
}

}  // namespace

namespace controllers {

void RegisterTelegramRoutes(const Config& conf, QuizCoreClient& quizCore) {
  auto webhookClient = std::make_shared<TelegramWebhookClient>();

  drogon::app().registerHandler(
      "/api/v1/telegram/bots/connect",
      [&quizCore, conf, webhookClient](const drogon::HttpRequestPtr& req,
                                       std::function<void(const drogon::HttpResponsePtr&)>&& cb) {
        if (!RequireCsrf(req, conf, cb)) return;

        std::string parseError;
        auto body = api::parseJsonBody(req, parseError);
        if (!body) {
          cb(api::jsonErrorResponse(400, api::ErrorCode::kInvalidJson, parseError));
          return;
        }

        api::JsonValidator validator(*body);
        auto botToken = validator.requiredString("botToken");
        auto name = validator.optionalString("name");
        if (!validator.ok() || !botToken) {
          cb(api::validationErrorResponse(validator.issues()));
          return;
        }
        if (!isValidTelegramTokenFormat(*botToken)) {
          cb(api::jsonErrorResponse(400, api::ErrorCode::kValidationError, "botToken has invalid format"));
          return;
        }

        const auto requestId = requestIdFromRequest(req);
        const auto ownerUserId = resolveUserId(req, conf);
        const std::string botId = "tg_" + util::random_hex(10);
        const std::string secret = util::random_hex(24);
        const std::string webhookPath = "/telegram/webhook/" + botId + "/" + secret;
        const std::string webhookUrl = conf.public_base_url + webhookPath;
        const std::string botTokenValue = *botToken;
        const std::string botName = name.value_or("Telegram Bot");

        spdlog::info("telegram_connect request_id={} bot_id={} owner_user_id={} token_masked={}",
                     requestId,
                     botId,
                     ownerUserId,
                     maskToken(botTokenValue));

        webhookClient->setWebhook(
            botTokenValue,
            webhookUrl,
            secret,
            requestId,
            [&, cb = std::move(cb), botId, secret, ownerUserId, botName, webhookUrl, requestId, botTokenValue](
                TelegramSetWebhookResult webhookResult) mutable {
              auto reg = quizCore.registerBot(ownerUserId, botName, "telegram-v1", webhookUrl, requestId);

              if (reg.status != QuizCoreRpcStatus::kOk) {
                spdlog::warn("telegram_connect registerBot rpc degraded request_id={} bot_id={} status={}",
                             requestId,
                             botId,
                             static_cast<int>(reg.status));
              }

              bindings().save({
                  .bot_id = botId,
                  .secret = secret,
                  .token = TelegramBotBinding::ProtectedToken::fromPlain(botTokenValue),
                  .owner_user_id = ownerUserId,
                  .name = botName,
              });

              Json::Value out;
              out["botId"] = botId;
              out["webhookUrl"] = webhookUrl;

              const bool grpcOk = reg.status == QuizCoreRpcStatus::kOk;
              if (!webhookResult.confirmed) {
                out["status"] = "webhook_not_confirmed";
              } else if (grpcOk) {
                out["status"] = "connected";
              } else {
                out["status"] = "connected_with_grpc_degradation";
              }

              Json::Value details;
              details["webhook"] = webhookResult.details;
              details["webhook"]["status"] = webhookResult.status;
              details["quizcore"]["status"] = grpcOk ? "ok" : "degraded";
              details["quizcore"]["code"] = static_cast<int>(reg.status);
              out["details"] = std::move(details);

              cb(drogon::HttpResponse::newHttpJsonResponse(out));
            });
      },
      {drogon::Post});

  drogon::app().registerHandler(
      "/telegram/webhook/{1}/{2}",
      [&quizCore](const drogon::HttpRequestPtr& req,
                  std::function<void(const drogon::HttpResponsePtr&)>&& cb,
                  std::string botId,
                  std::string secret) {
        auto binding = bindings().get(botId);
        if (!binding) {
          cb(api::jsonErrorResponse(404, api::ErrorCode::kNotFound, "bot not found"));
          return;
        }
        if (binding->secret != secret) {
          cb(api::jsonErrorResponse(403, api::ErrorCode::kForbidden, "invalid webhook secret"));
          return;
        }

        const auto headerSecret = req->getHeader("x-telegram-bot-api-secret-token");
        if (!headerSecret.empty() && headerSecret != secret) {
          cb(api::jsonErrorResponse(403, api::ErrorCode::kForbidden, "telegram secret header mismatch"));
          return;
        }

        Json::Value payload;
        Json::CharReaderBuilder b;
        std::string errs;
        std::istringstream iss(req->body());
        if (!Json::parseFromStream(b, iss, &payload, &errs)) {
          cb(api::jsonErrorResponse(400, api::ErrorCode::kInvalidJson, "invalid telegram update json"));
          return;
        }

        const auto requestId = requestIdFromRequest(req);
        const std::string text = payload["message"].get("text", "").asString();

        if (text.rfind("/create_game", 0) == 0) {
          const auto room = quizCore.createRoom(binding->owner_user_id,
                                                "telegram-default-quiz",
                                                "Telegram room",
                                                requestId);
          if (room && room->status == QuizCoreRpcStatus::kOk) {
            spdlog::info("telegram_create_game_ok request_id={} bot_id={} pin={}", requestId, botId, room->pin);
          } else {
            spdlog::warn("telegram_create_game_failed request_id={} bot_id={}", requestId, botId);
          }
        } else if (text == "/invite" || text == "/pin") {
          spdlog::info("telegram_invite_or_pin request_id={} bot_id={}", requestId, botId);
        }

        Json::Value ok;
        ok["ok"] = true;
        ok["status"] = "accepted";
        cb(drogon::HttpResponse::newHttpJsonResponse(ok));
      },
      {drogon::Post});
}

}  // namespace controllers
