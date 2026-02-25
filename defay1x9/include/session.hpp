#pragma once
#include <drogon/HttpRequest.h>
#include <drogon/HttpResponse.h>
#include <optional>
#include <string>

namespace security {

struct SessionCookieConfig final {
  std::string cookie_name = "QB-SESSION";
  bool cookie_secure = false;
  bool cookie_http_only = true;
  std::string cookie_path = "/";
  int ttl_seconds = 24 * 3600;
};

struct SessionClaims final {
  std::string pin;
  std::string role;     // "host" | "player"
  std::string subject;  // host_user_id | player_id
  std::string room_id;
};

std::string IssueSessionToken(const SessionClaims& c, int ttl_seconds);

std::optional<SessionClaims> VerifySessionToken(const std::string& token);

std::optional<SessionClaims> VerifySessionFromRequest(
    const drogon::HttpRequestPtr& req,
    const SessionCookieConfig& cfg);

void SetSessionCookie(const drogon::HttpResponsePtr& resp,
                      const SessionCookieConfig& cfg,
                      const std::string& token);

void ClearSessionCookie(const drogon::HttpResponsePtr& resp,
                        const SessionCookieConfig& cfg);

} // namespace security