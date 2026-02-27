#pragma once

#include <functional>
#include <string>

#include <json/json.h>

namespace controllers {

struct TelegramSetWebhookResult final {
  bool confirmed{false};
  std::string status;
  Json::Value details;
};

class TelegramWebhookClient final {
public:
  explicit TelegramWebhookClient(double timeoutSeconds = 4.0);

  void setWebhook(const std::string& botToken,
                  const std::string& webhookUrl,
                  const std::string& secret,
                  const std::string& requestId,
                  std::function<void(TelegramSetWebhookResult)> cb) const;

private:
  double timeoutSeconds_;
};

}  // namespace controllers
