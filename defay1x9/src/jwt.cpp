#include "jwt.hpp"

#include <jwt-cpp/jwt.h>
#include <chrono>

namespace security {

static std::string makeToken(const std::string& secret, int ttlSeconds,
                             const std::string& pin, const std::string& role,
                             const std::string& subject) {
  using clock = std::chrono::system_clock;
  auto now = clock::now();
  auto exp = now + std::chrono::seconds(ttlSeconds);

  return jwt::create()
    .set_type("JWT")
    .set_issued_at(now)
    .set_expires_at(exp)
    .set_payload_claim("pin", jwt::claim(pin))
    .set_payload_claim("role", jwt::claim(role))
    .set_subject(subject)
    .sign(jwt::algorithm::hs256{secret});
}

std::string MakeTokenHost(const std::string& secret, int ttlSeconds,
                          const std::string& pin, const std::string& hostId) {
  return makeToken(secret, ttlSeconds, pin, "host", hostId);
}

std::string MakeTokenPlayer(const std::string& secret, int ttlSeconds,
                            const std::string& pin, const std::string& playerId) {
  return makeToken(secret, ttlSeconds, pin, "player", playerId);
}

std::optional<JwtClaims> Verify(const std::string& secret, const std::string& token) {
  try {
    auto decoded = jwt::decode(token);

    auto verifier = jwt::verify()
      .allow_algorithm(jwt::algorithm::hs256{secret})
      .with_type("JWT");

    verifier.verify(decoded);

    JwtClaims c;
    c.pin = decoded.get_payload_claim("pin").as_string();
    c.role = decoded.get_payload_claim("role").as_string();
    c.subject = decoded.get_subject();
    if (c.pin.empty() || c.role.empty() || c.subject.empty()) return std::nullopt;
    return c;
  } catch (...) {
    return std::nullopt;
  }
}

} // namespace security