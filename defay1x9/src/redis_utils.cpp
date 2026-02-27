#include "redis_utils.hpp"

#include <array>
#include <cstdio>
#include <optional>
#include <string>

namespace {

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

std::string keyForPresence(const std::string& roomId, const std::string& actorId) {
  return "presence:" + roomId + ":" + actorId;
}

}  // namespace

std::optional<std::string> RedisRunRaw(const std::string& redisUrl, const std::string& command) {
  if (redisUrl.empty()) return std::nullopt;
  const std::string full = "redis-cli -u " + quoteRedisArg(redisUrl) + " --raw " + command + " 2>/dev/null";
  FILE* pipe = popen(full.c_str(), "r");
  if (!pipe) return std::nullopt;

  std::string output;
  std::array<char, 256> buffer{};
  while (fgets(buffer.data(), static_cast<int>(buffer.size()), pipe) != nullptr) {
    output += buffer.data();
  }
  const auto rc = pclose(pipe);
  if (rc != 0) return std::nullopt;

  while (!output.empty() && (output.back() == '\n' || output.back() == '\r')) output.pop_back();
  return output;
}

std::optional<RedisFixedWindowDecision> RedisAllowFixedWindow(const std::string& redisUrl,
                                                              const std::string& key,
                                                              uint64_t limit,
                                                              uint64_t windowSeconds) {
  auto incr = RedisRunRaw(redisUrl, "INCR " + quoteRedisArg(key));
  if (!incr.has_value()) return std::nullopt;

  if (*incr == "1") {
    RedisRunRaw(redisUrl,
                "EXPIRE " + quoteRedisArg(key) + " " + std::to_string(windowSeconds));
  }

  RedisFixedWindowDecision out;
  out.limit = limit;
  try {
    out.current = static_cast<uint64_t>(std::stoull(*incr));
  } catch (...) {
    return std::nullopt;
  }
  out.allowed = out.current <= limit;
  return out;
}

bool RedisSetPresenceOnline(const std::string& redisUrl,
                            const std::string& roomId,
                            const std::string& actorId,
                            uint64_t ttlSeconds) {
  const auto res = RedisRunRaw(redisUrl,
                               "SET " + quoteRedisArg(keyForPresence(roomId, actorId)) +
                                   " 1 EX " + std::to_string(ttlSeconds));
  return res.has_value() && *res == "OK";
}

bool RedisSetPresenceOffline(const std::string& redisUrl,
                             const std::string& roomId,
                             const std::string& actorId) {
  const auto res = RedisRunRaw(redisUrl,
                               "DEL " + quoteRedisArg(keyForPresence(roomId, actorId)));
  return res.has_value();
}

bool RedisIsPresenceOnline(const std::string& redisUrl,
                           const std::string& roomId,
                           const std::string& actorId) {
  const auto res = RedisRunRaw(redisUrl,
                               "EXISTS " + quoteRedisArg(keyForPresence(roomId, actorId)));
  return res.has_value() && *res == "1";
}
