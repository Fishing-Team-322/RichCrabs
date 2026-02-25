#include "config.hpp"
#include <cstdlib>

static std::string envStr(const char* k, const std::string& d) {
  if (const char* v = std::getenv(k)) {
    std::string s = v;
    if (!s.empty()) return s;
  }
  return d;
}
static int envInt(const char* k, int d) {
  if (const char* v = std::getenv(k)) {
    try { return std::stoi(v); } catch (...) {}
  }
  return d;
}

Config Config::LoadFromEnv() {
  Config c;

  c.listen_host = envStr("GW_LISTEN_HOST", c.listen_host);
  c.listen_port = static_cast<uint16_t>(envInt("GW_LISTEN_PORT", c.listen_port));

  c.public_base_url = envStr("GW_PUBLIC_BASE_URL", c.public_base_url);

  c.jwt_secret = envStr("GW_JWT_SECRET", c.jwt_secret);
  c.jwt_ttl_seconds = envInt("GW_JWT_TTL_SECONDS", c.jwt_ttl_seconds);

  c.openapi_path = envStr("GW_OPENAPI_PATH", c.openapi_path);
  return c;
}