#include "session.hpp"
#include "random.hpp"

#include <drogon/Cookie.h>
#include <chrono>
#include <mutex>
#include <unordered_map>

namespace security {

using Clock = std::chrono::system_clock;

struct StoredSession {
  SessionClaims claims;
  Clock::time_point expires_at;
};

static std::mutex g_mu;
static std::unordered_map<std::string, StoredSession> g_sessions;

static bool expired(const StoredSession& s) {
  return Clock::now() >= s.expires_at;
}

std::string IssueSessionToken(const SessionClaims& c, int ttl_seconds) {
  std::lock_guard lk(g_mu);

  const std::string token = "s_" + util::random_hex(48);
  StoredSession s;
  s.claims = c;
  s.expires_at = Clock::now() + std::chrono::seconds(ttl_seconds);

  g_sessions[token] = std::move(s);
  return token;
}

std::optional<SessionClaims> VerifySessionToken(const std::string& token) {
  std::lock_guard lk(g_mu);

  auto it = g_sessions.find(token);
  if (it == g_sessions.end()) return std::nullopt;

  if (expired(it->second)) {
    g_sessions.erase(it);
    return std::nullopt;
  }
  return it->second.claims;
}

std::optional<SessionClaims> VerifySessionFromRequest(
    const drogon::HttpRequestPtr& req,
    const SessionCookieConfig& cfg) {
  const auto token = req->getCookie(cfg.cookie_name);
  if (token.empty()) return std::nullopt;
  return VerifySessionToken(token);
}

void SetSessionCookie(const drogon::HttpResponsePtr& resp,
                      const SessionCookieConfig& cfg,
                      const std::string& token) {
  drogon::Cookie c(cfg.cookie_name, token);
  c.setPath(cfg.cookie_path);
  c.setSecure(cfg.cookie_secure);
  c.setHttpOnly(cfg.cookie_http_only);
  c.setSameSite(drogon::Cookie::SameSite::kLax);
  resp->addCookie(c);
}

void ClearSessionCookie(const drogon::HttpResponsePtr& resp,
                        const SessionCookieConfig& cfg) {
  drogon::Cookie c(cfg.cookie_name, "");
  c.setPath(cfg.cookie_path);
  c.setSecure(cfg.cookie_secure);
  c.setHttpOnly(cfg.cookie_http_only);
  c.setSameSite(drogon::Cookie::SameSite::kLax);
  c.setMaxAge(0);
  resp->addCookie(c);
}

} // namespace security