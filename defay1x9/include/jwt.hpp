#pragma once
#include <optional>
#include <string>

namespace security {

struct JwtClaims final {
  std::string pin;
  std::string role;     // "host" | "player"
  std::string subject;  // host_id or player_id
};

std::string MakeTokenHost(const std::string& secret, int ttlSeconds,
                          const std::string& pin, const std::string& hostId);

std::string MakeTokenPlayer(const std::string& secret, int ttlSeconds,
                            const std::string& pin, const std::string& playerId);

std::optional<JwtClaims> Verify(const std::string& secret, const std::string& token);

} // namespace security