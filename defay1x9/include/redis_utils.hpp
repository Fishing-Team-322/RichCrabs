#pragma once

#include <cstdint>
#include <optional>
#include <string>

struct RedisFixedWindowDecision final {
  bool allowed = false;
  uint64_t current = 0;
  uint64_t limit = 0;
};

std::optional<std::string> RedisRunRaw(const std::string& redisUrl, const std::string& command);

std::optional<RedisFixedWindowDecision> RedisAllowFixedWindow(const std::string& redisUrl,
                                                              const std::string& key,
                                                              uint64_t limit,
                                                              uint64_t windowSeconds);

bool RedisSetPresenceOnline(const std::string& redisUrl,
                            const std::string& roomId,
                            const std::string& actorId,
                            uint64_t ttlSeconds);

bool RedisSetPresenceOffline(const std::string& redisUrl,
                             const std::string& roomId,
                             const std::string& actorId);

bool RedisIsPresenceOnline(const std::string& redisUrl,
                           const std::string& roomId,
                           const std::string& actorId);
