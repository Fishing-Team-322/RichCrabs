#pragma once

#include <optional>
#include <string>

#include <json/value.h>

#include "config.hpp"

namespace controllers {

struct BotState final {
  std::string bot_id;
  std::string owner_user_id;
  std::optional<std::string> name;
  bool enabled = true;
  Json::Value metadata;
};

bool EnsureBotStateSchema(const Config& conf, std::string& error);
std::optional<BotState> GetBotState(const Config& conf, const std::string& botId, std::string& error);
bool UpsertBotStatePatch(const Config& conf,
                         const std::string& botId,
                         const std::string& ownerUserId,
                         const std::optional<std::string>& name,
                         const std::optional<bool>& enabled,
                         const std::optional<Json::Value>& metadata,
                         BotState& updated,
                         std::string& error,
                         bool& conflict);
bool SeedBotStateOwner(const Config& conf,
                       const std::string& botId,
                       const std::string& ownerUserId,
                       const std::optional<std::string>& defaultName,
                       std::string& error);

}  // namespace controllers
