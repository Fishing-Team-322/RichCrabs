#include "controllers/TelegramController.hpp"

#include <drogon/drogon.h>
#include <spdlog/spdlog.h>

#include <cstdint>
#include <memory>
#include <optional>
#include <regex>
#include <sstream>
#include <string>

#include "controllers/BotStateStorage.hpp"
#include "controllers/ControllerUtils.hpp"
#include "controllers/TelegramWebhookClient.hpp"
#include "http_api_utils.hpp"
#include "random.hpp"
#include "redis_utils.hpp"

namespace {

constexpr const char* kDefaultTelegramQuizId = "telegram-default-quiz";

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

struct TelegramRoomSnapshot final {
  std::string room_id;
  std::string pin;
  std::string invite_token;
  std::string invite_url;
};

std::string quoteRedisArg(const std::string& arg) {
  std::string escaped = "'";
  for (const auto ch : arg) {
    if (ch == '\'') {
      escaped += "'\\''";
    } else {
      escaped.push_back(ch);
    }
  }
  escaped.push_back('\'');
  return escaped;
}

std::string redisBotBindingKey(const std::string& botId) {
  return "gateway:telegram:binding:" + botId;
}

std::string redisLastRoomKey(const std::string& botId) {
  return "gateway:telegram:last_room:" + botId;
}

bool saveBinding(const Config& conf, const TelegramBotBinding& binding) {
  const auto key = redisBotBindingKey(binding.bot_id);
  const auto command =
      "HSET " + quoteRedisArg(key) +
      " bot_id " + quoteRedisArg(binding.bot_id) +
      " secret " + quoteRedisArg(binding.secret) +
      " token " + quoteRedisArg(binding.token.reveal()) +
      " owner_user_id " + quoteRedisArg(binding.owner_user_id) +
      " name " + quoteRedisArg(binding.name);
  return RedisRunRaw(conf.redis_url, command).has_value();
}

std::optional<TelegramBotBinding> getBinding(const Config& conf, const std::string& botId) {
  const auto key = redisBotBindingKey(botId);
  const auto secret = RedisRunRaw(conf.redis_url, "HGET " + quoteRedisArg(key) + " secret");
  const auto token = RedisRunRaw(conf.redis_url, "HGET " + quoteRedisArg(key) + " token");
  const auto ownerUserId = RedisRunRaw(conf.redis_url, "HGET " + quoteRedisArg(key) + " owner_user_id");
  const auto name = RedisRunRaw(conf.redis_url, "HGET " + quoteRedisArg(key) + " name");
  if (!secret || !token || !ownerUserId || !name || secret->empty() || token->empty() || ownerUserId->empty()) {
    return std::nullopt;
  }
  return TelegramBotBinding{
      .bot_id = botId,
      .secret = *secret,
      .token = TelegramBotBinding::ProtectedToken::fromPlain(*token),
      .owner_user_id = *ownerUserId,
      .name = *name,
  };
}

bool saveLastRoom(const Config& conf, const std::string& botId, const TelegramRoomSnapshot& room) {
  const auto key = redisLastRoomKey(botId);
  const auto command =
      "HSET " + quoteRedisArg(key) +
      " room_id " + quoteRedisArg(room.room_id) +
      " pin " + quoteRedisArg(room.pin) +
      " invite_token " + quoteRedisArg(room.invite_token) +
      " invite_url " + quoteRedisArg(room.invite_url);
  return RedisRunRaw(conf.redis_url, command).has_value();
}

std::optional<TelegramRoomSnapshot> getLastRoom(const Config& conf, const std::string& botId) {
  const auto key = redisLastRoomKey(botId);
  const auto roomId = RedisRunRaw(conf.redis_url, "HGET " + quoteRedisArg(key) + " room_id");
  const auto pin = RedisRunRaw(conf.redis_url, "HGET " + quoteRedisArg(key) + " pin");
  const auto inviteToken = RedisRunRaw(conf.redis_url, "HGET " + quoteRedisArg(key) + " invite_token");
  const auto inviteUrl = RedisRunRaw(conf.redis_url, "HGET " + quoteRedisArg(key) + " invite_url");
  if (!roomId || !pin || !inviteToken || !inviteUrl || roomId->empty() || pin->empty()) {
    return std::nullopt;
  }
  return TelegramRoomSnapshot{
      .room_id = *roomId,
      .pin = *pin,
      .invite_token = *inviteToken,
      .invite_url = *inviteUrl,
  };
}

bool isValidTelegramTokenFormat(const std::string& token) {
  static const std::regex kPattern(R"(^[0-9]{6,12}:[A-Za-z0-9_\-]{20,}$)");
  return std::regex_match(token, kPattern);
}

std::string maskToken(const std::string& token) {
  if (token.size() <= 8) return "***";
  return token.substr(0, 4) + "***" + token.substr(token.size() - 4);
}

std::optional<int64_t> extractInt64(const Json::Value& value) {
  if (value.isInt64()) return value.asInt64();
  if (value.isInt()) return value.asInt();
  if (value.isUInt64()) {
    return static_cast<int64_t>(value.asUInt64());
  }
  if (value.isUInt()) {
    return static_cast<int64_t>(value.asUInt());
  }
  if (value.isString()) {
    try {
      return std::stoll(value.asString());
    } catch (...) {
      return std::nullopt;
    }
  }
  return std::nullopt;
}

struct TelegramCommand final {
  std::string command;
  std::optional<std::string> argument;
};

std::optional<TelegramCommand> parseTelegramCommand(const std::string& text) {
  if (text.empty() || text.front() != '/') return std::nullopt;

  std::istringstream iss(text);
  std::string first;
  iss >> first;
  if (first.empty()) return std::nullopt;

  const auto mentionPos = first.find('@');
  if (mentionPos != std::string::npos) {
    first = first.substr(0, mentionPos);
  }

  std::string arg;
  iss >> arg;
  TelegramCommand out;
  out.command = first;
  if (!arg.empty()) out.argument = arg;
  return out;
}

std::string buildCreateGameMessage(const TelegramRoomSnapshot& room) {
  std::ostringstream out;
  out << "✅ Игра создана\n";
  out << "PIN: " << room.pin << "\n";
  out << "Invite: " << room.invite_url;
  return out.str();
}

std::string buildPinMessage(const TelegramRoomSnapshot& room) {
  return "PIN последней комнаты: " + room.pin;
}

std::string buildInviteMessage(const TelegramRoomSnapshot& room) {
  return "Invite последней комнаты: " + room.invite_url;
}

void sendTelegramReply(const std::shared_ptr<controllers::TelegramWebhookClient>& webhookClient,
                       const TelegramBotBinding& binding,
                       const std::optional<int64_t>& chatId,
                       const std::optional<int64_t>& messageId,
                       const std::string& text,
                       const std::string& requestId,
                       const std::string& botId) {
  if (!chatId.has_value()) {
    spdlog::warn("telegram_reply_skipped_no_chat request_id={} bot_id={}", requestId, botId);
    return;
  }

  webhookClient->sendMessage(
      binding.token.reveal(),
      std::to_string(*chatId),
      text,
      messageId,
      requestId,
      [requestId, botId](controllers::TelegramSendMessageResult result) {
        if (!result.delivered) {
          spdlog::warn("telegram_reply_failed request_id={} bot_id={} status={}", requestId, botId, result.status);
        }
      });
}

}  // namespace

namespace controllers {

void RegisterTelegramRoutes(const Config& conf, QuizCoreClient& quizCore, EntitlementsClient& entitlementsClient) {
  auto webhookClient = std::make_shared<TelegramWebhookClient>();

  drogon::app().registerHandler(
      "/api/v1/telegram/bots/connect",
      [&quizCore, &entitlementsClient, conf, webhookClient](const drogon::HttpRequestPtr& req,
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
        std::string ownerUserId;
        if (!RequireUserId(req, conf, cb, ownerUserId)) return;
        const auto entitlement = entitlementsClient.checkAndConsume(ownerUserId, "REGISTER_BOT");
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
        const std::string botId = "bot_" + util::random_hex(24);
        const std::string secret = util::random_hex(24);
        const std::string webhookPath = "/api/v1/telegram/webhook/" + botId + "/" + secret;
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

              const auto saved = saveBinding(conf, {
                  .bot_id = botId,
                  .secret = secret,
                  .token = TelegramBotBinding::ProtectedToken::fromPlain(botTokenValue),
                  .owner_user_id = ownerUserId,
                  .name = botName,
              });
              if (!saved) {
                spdlog::warn("telegram_connect redis_binding_save_failed request_id={} bot_id={}", requestId, botId);
              }

              std::string stateError;
              SeedBotStateOwner(conf, botId, ownerUserId, botName, stateError);

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
      "/api/v1/telegram/webhook/{1}/{2}",
      [&quizCore, conf, webhookClient](const drogon::HttpRequestPtr& req,
                                       std::function<void(const drogon::HttpResponsePtr&)>&& cb,
                                       std::string botId,
                                       std::string secret) {
        auto binding = getBinding(conf, botId);
        if (!binding) {
          cb(api::jsonErrorResponse(404, api::ErrorCode::kNotFound, "bot not found"));
          return;
        }
        if (binding->secret != secret) {
          cb(api::jsonErrorResponse(403, api::ErrorCode::kForbidden, "invalid webhook secret"));
          return;
        }

        std::string stateError;
        auto state = GetBotState(conf, botId, stateError);
        if (state && !state->enabled) {
          cb(api::jsonErrorResponse(403, api::ErrorCode::kForbidden, "bot is disabled"));
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
        const Json::Value& message = payload["message"];
        const std::string text = message.get("text", "").asString();
        const auto chatId = extractInt64(message["chat"]["id"]);
        const auto messageId = extractInt64(message["message_id"]);

        Json::Value commandResult;
        commandResult["status"] = "ignored";

        auto command = parseTelegramCommand(text);
        if (command && command->command == "/create_game") {
          const std::string quizId = command->argument.value_or(kDefaultTelegramQuizId);
          const auto room = quizCore.createRoom(binding->owner_user_id, quizId, "Telegram room", requestId);
          if (room && room->status == QuizCoreRpcStatus::kOk) {
            TelegramRoomSnapshot snapshot{
                .room_id = room->room_id,
                .pin = room->pin,
                .invite_token = room->invite_token,
                .invite_url = conf.public_base_url + "/invite/" + room->invite_token,
            };
            if (!saveLastRoom(conf, botId, snapshot)) {
              spdlog::warn("telegram_room_snapshot_persist_failed request_id={} bot_id={}", requestId, botId);
            }
            commandResult["status"] = "ok";
            commandResult["message"] = "room_created";
            commandResult["pin"] = snapshot.pin;
            commandResult["inviteUrl"] = snapshot.invite_url;

            sendTelegramReply(webhookClient,
                              *binding,
                              chatId,
                              messageId,
                              buildCreateGameMessage(snapshot),
                              requestId,
                              botId);
            spdlog::info("telegram_create_game_ok request_id={} bot_id={} pin={}", requestId, botId, room->pin);
          } else {
            commandResult["status"] = "degraded";
            commandResult["error"] = "create_room_rpc_unavailable";
            if (room) {
              commandResult["rpcStatus"] = static_cast<int>(room->status);
              if (!room->error_code.empty()) commandResult["rpcErrorCode"] = room->error_code;
              if (!room->error_message.empty()) commandResult["rpcErrorMessage"] = room->error_message;
            } else {
              commandResult["rpcStatus"] = "null";
            }

            sendTelegramReply(webhookClient,
                              *binding,
                              chatId,
                              messageId,
                              "⚠️ create_game временно недоступен (degraded). Попробуйте позже.",
                              requestId,
                              botId);
            spdlog::warn("telegram_create_game_failed request_id={} bot_id={}", requestId, botId);
          }
        } else if (command && command->command == "/invite") {
          auto lastRoom = getLastRoom(conf, botId);
          if (lastRoom) {
            commandResult["status"] = "ok";
            commandResult["inviteUrl"] = lastRoom->invite_url;
            sendTelegramReply(webhookClient,
                              *binding,
                              chatId,
                              messageId,
                              buildInviteMessage(*lastRoom),
                              requestId,
                              botId);
          } else {
            commandResult["status"] = "degraded";
            commandResult["error"] = "room_not_initialized";
            sendTelegramReply(webhookClient,
                              *binding,
                              chatId,
                              messageId,
                              "Нет данных о комнате. Сначала выполните /create_game",
                              requestId,
                              botId);
          }
        } else if (command && command->command == "/pin") {
          auto lastRoom = getLastRoom(conf, botId);
          if (lastRoom) {
            commandResult["status"] = "ok";
            commandResult["pin"] = lastRoom->pin;
            sendTelegramReply(webhookClient,
                              *binding,
                              chatId,
                              messageId,
                              buildPinMessage(*lastRoom),
                              requestId,
                              botId);
          } else {
            commandResult["status"] = "degraded";
            commandResult["error"] = "room_not_initialized";
            sendTelegramReply(webhookClient,
                              *binding,
                              chatId,
                              messageId,
                              "Нет данных о комнате. Сначала выполните /create_game",
                              requestId,
                              botId);
          }
        }

        Json::Value ok;
        ok["ok"] = true;
        ok["status"] = "accepted";
        ok["botId"] = botId;
        ok["message"] = text;
        if (chatId.has_value()) ok["chatId"] = Json::Int64(*chatId);
        if (messageId.has_value()) ok["messageId"] = Json::Int64(*messageId);
        ok["commandResult"] = std::move(commandResult);
        cb(drogon::HttpResponse::newHttpJsonResponse(ok));
      },
      {drogon::Post});
}

}  // namespace controllers
