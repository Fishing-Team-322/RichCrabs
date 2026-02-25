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
static bool envBool(const char* k, bool d) {
  if (const char* v = std::getenv(k)) {
    std::string s = v;
    for (auto& ch : s) ch = (char)tolower(ch);
    if (s == "1" || s == "true" || s == "yes") return true;
    if (s == "0" || s == "false" || s == "no") return false;
  }
  return d;
}

Config Config::LoadFromEnv() {
  Config c;

  c.listen_host = envStr("GW_LISTEN_HOST", c.listen_host);
  c.listen_port = (uint16_t)envInt("GW_LISTEN_PORT", c.listen_port);

  c.public_base_url = envStr("GW_PUBLIC_BASE_URL", c.public_base_url);
  c.openapi_path = envStr("GW_OPENAPI_PATH", c.openapi_path);

  c.csrf.cookie_name = envStr("GW_CSRF_COOKIE_NAME", c.csrf.cookie_name);
  c.csrf.header_name = envStr("GW_CSRF_HEADER_NAME", c.csrf.header_name);
  c.csrf.cookie_secure = envBool("GW_CSRF_COOKIE_SECURE", c.csrf.cookie_secure);
  c.csrf.cookie_http_only = envBool("GW_CSRF_COOKIE_HTTPONLY", c.csrf.cookie_http_only);
  c.csrf.cookie_path = envStr("GW_CSRF_COOKIE_PATH", c.csrf.cookie_path);

  c.session.cookie_name = envStr("GW_SESSION_COOKIE_NAME", c.session.cookie_name);
  c.session.cookie_secure = envBool("GW_SESSION_COOKIE_SECURE", c.session.cookie_secure);
  c.session.cookie_http_only = envBool("GW_SESSION_COOKIE_HTTPONLY", c.session.cookie_http_only);
  c.session.cookie_path = envStr("GW_SESSION_COOKIE_PATH", c.session.cookie_path);
  c.session.ttl_seconds = envInt("GW_SESSION_TTL_SECONDS", c.session.ttl_seconds);
  return c;
}