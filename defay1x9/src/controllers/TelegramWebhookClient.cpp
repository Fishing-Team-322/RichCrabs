#include "controllers/TelegramWebhookClient.hpp"

#include <drogon/HttpClient.h>
#include <drogon/HttpTypes.h>
#include <drogon/HttpRequest.h>
#include <spdlog/spdlog.h>

#include <utility>

namespace {

std::string maskToken(const std::string& token) {
  if (token.size() <= 8) return "***";
  return token.substr(0, 4) + "***" + token.substr(token.size() - 4);
}

}  // namespace

namespace controllers {

TelegramWebhookClient::TelegramWebhookClient(double timeoutSeconds) : timeoutSeconds_(timeoutSeconds) {}

void TelegramWebhookClient::setWebhook(const std::string& botToken,
                                       const std::string& webhookUrl,
                                       const std::string& secret,
                                       const std::string& requestId,
                                       std::function<void(TelegramSetWebhookResult)> cb) const {
  auto client = drogon::HttpClient::newHttpClient("https://api.telegram.org");
  Json::Value payload;
  payload["url"] = webhookUrl;
  payload["secret_token"] = secret;
  payload["drop_pending_updates"] = true;

  auto req = drogon::HttpRequest::newHttpJsonRequest(payload);
  req->setMethod(drogon::Post);
  req->setPath("/bot" + botToken + "/setWebhook");

  spdlog::info("telegram_set_webhook_start request_id={} token_masked={} webhook_url={}",
               requestId,
               maskToken(botToken),
               webhookUrl);

  client->sendRequest(
      req,
      [cb = std::move(cb), requestId, maskedToken = maskToken(botToken)](drogon::ReqResult result,
                                                                          const drogon::HttpResponsePtr& resp) mutable {
        TelegramSetWebhookResult out;
        out.details["requestId"] = requestId;

        if (result != drogon::ReqResult::Ok || !resp) {
          out.confirmed = false;
          out.status = "webhook_not_confirmed";
          out.details["reason"] = "telegram_unreachable";
          out.details["transportResult"] = static_cast<int>(result);
          spdlog::warn("telegram_set_webhook_transport_error request_id={} token_masked={} result={}",
                       requestId,
                       maskedToken,
                       static_cast<int>(result));
          cb(std::move(out));
          return;
        }

        out.details["httpStatus"] = static_cast<int>(resp->statusCode());

        auto body = resp->getJsonObject();
        if (body) {
          out.details["telegramOk"] = (*body).get("ok", false).asBool();
          if ((*body).isMember("description")) {
            out.details["telegramDescription"] = (*body)["description"].asString();
          }
          if ((*body).isMember("error_code")) {
            out.details["telegramErrorCode"] = (*body)["error_code"].asInt();
          }
        }

        const bool httpOk = resp->statusCode() == drogon::k200OK;
        const bool telegramOk = body && (*body).get("ok", false).asBool();
        if (httpOk && telegramOk) {
          out.confirmed = true;
          out.status = "connected";
          spdlog::info("telegram_set_webhook_ok request_id={} token_masked={}", requestId, maskedToken);
        } else {
          out.confirmed = false;
          out.status = "webhook_not_confirmed";
          spdlog::warn("telegram_set_webhook_rejected request_id={} token_masked={} http_status={}",
                       requestId,
                       maskedToken,
                       static_cast<int>(resp->statusCode()));
        }

        cb(std::move(out));
      },
      timeoutSeconds_);
}


void TelegramWebhookClient::sendMessage(const std::string& botToken,
                                        const std::string& chatId,
                                        const std::string& text,
                                        const std::optional<int64_t>& replyToMessageId,
                                        const std::string& requestId,
                                        std::function<void(TelegramSendMessageResult)> cb) const {
  auto client = drogon::HttpClient::newHttpClient("https://api.telegram.org");
  Json::Value payload;
  payload["chat_id"] = chatId;
  payload["text"] = text;
  if (replyToMessageId.has_value()) {
    payload["reply_to_message_id"] = Json::Int64(*replyToMessageId);
  }

  auto req = drogon::HttpRequest::newHttpJsonRequest(payload);
  req->setMethod(drogon::Post);
  req->setPath("/bot" + botToken + "/sendMessage");

  spdlog::info("telegram_send_message_start request_id={} token_masked={} chat_id={}",
               requestId,
               maskToken(botToken),
               chatId);

  client->sendRequest(
      req,
      [cb = std::move(cb), requestId, maskedToken = maskToken(botToken)](drogon::ReqResult result,
                                                                          const drogon::HttpResponsePtr& resp) mutable {
        TelegramSendMessageResult out;
        out.details["requestId"] = requestId;

        if (result != drogon::ReqResult::Ok || !resp) {
          out.delivered = false;
          out.status = "telegram_unreachable";
          out.details["transportResult"] = static_cast<int>(result);
          spdlog::warn("telegram_send_message_transport_error request_id={} token_masked={} result={}",
                       requestId,
                       maskedToken,
                       static_cast<int>(result));
          cb(std::move(out));
          return;
        }

        out.details["httpStatus"] = static_cast<int>(resp->statusCode());
        auto body = resp->getJsonObject();
        if (body) {
          out.details["telegramOk"] = (*body).get("ok", false).asBool();
          if ((*body).isMember("description")) {
            out.details["telegramDescription"] = (*body)["description"].asString();
          }
          if ((*body).isMember("error_code")) {
            out.details["telegramErrorCode"] = (*body)["error_code"].asInt();
          }
        }

        const bool httpOk = resp->statusCode() == drogon::k200OK;
        const bool telegramOk = body && (*body).get("ok", false).asBool();
        out.delivered = httpOk && telegramOk;
        out.status = out.delivered ? "sent" : "telegram_rejected";

        if (out.delivered) {
          spdlog::info("telegram_send_message_ok request_id={} token_masked={}", requestId, maskedToken);
        } else {
          spdlog::warn("telegram_send_message_failed request_id={} token_masked={} http_status={}",
                       requestId,
                       maskedToken,
                       static_cast<int>(resp->statusCode()));
        }

        cb(std::move(out));
      },
      timeoutSeconds_);
}

}  // namespace controllers
