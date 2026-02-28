#include "session.hpp"

#include <drogon/Cookie.h>
#include <drogon/utils/Utilities.h>

#include <chrono>
#include <json/reader.h>
#include <json/value.h>
#include <mutex>
#include <openssl/hmac.h>
#include <sstream>
#include <stdexcept>

namespace security {

namespace {
using Clock = std::chrono::system_clock;

std::mutex g_key_mu;
std::string g_signing_key;

std::int64_t unixNow() {
  return std::chrono::duration_cast<std::chrono::seconds>(Clock::now().time_since_epoch()).count();
}

std::string toHex(const unsigned char* bytes, unsigned int len) {
  static constexpr char kHex[] = "0123456789abcdef";
  std::string out;
  out.resize(len * 2);
  for (unsigned int i = 0; i < len; ++i) {
    out[i * 2] = kHex[(bytes[i] >> 4) & 0x0F];
    out[i * 2 + 1] = kHex[bytes[i] & 0x0F];
  }
  return out;
}

std::string b64UrlEncode(const std::string& in) {
  auto out = drogon::utils::base64Encode(in);
  for (auto& ch : out) {
    if (ch == '+') ch = '-';
    else if (ch == '/') ch = '_';
  }
  while (!out.empty() && out.back() == '=') out.pop_back();
  return out;
}

std::optional<std::string> b64UrlDecode(const std::string& in) {
  std::string s = in;
  for (auto& ch : s) {
    if (ch == '-') ch = '+';
    else if (ch == '_') ch = '/';
  }
  while (s.size() % 4 != 0) s.push_back('=');
  try {
    return drogon::utils::base64Decode(s);
  } catch (...) {
    return std::nullopt;
  }
}

std::string currentSigningKey() {
  std::lock_guard lk(g_key_mu);
  if (g_signing_key.empty()) {
    throw std::runtime_error("session signing key is not configured");
  }
  return g_signing_key;
}

std::string signPayload(const std::string& payload) {
  const std::string key = currentSigningKey();

  unsigned int digest_len = 0;
  unsigned char digest[EVP_MAX_MD_SIZE] = {0};
  HMAC(EVP_sha256(),
       key.data(),
       static_cast<int>(key.size()),
       reinterpret_cast<const unsigned char*>(payload.data()),
       payload.size(),
       digest,
       &digest_len);
  return toHex(digest, digest_len);
}

bool constantTimeEq(const std::string& a, const std::string& b) {
  if (a.size() != b.size()) return false;
  unsigned char diff = 0;
  for (size_t i = 0; i < a.size(); ++i) {
    diff |= static_cast<unsigned char>(a[i] ^ b[i]);
  }
  return diff == 0;
}
}  // namespace

void SetSessionSigningKey(std::string key) {
  std::lock_guard lk(g_key_mu);
  g_signing_key = std::move(key);
}

std::string IssueSessionToken(const SessionClaims& c, int ttl_seconds) {
  SessionClaims claims = c;
  claims.exp = unixNow() + ttl_seconds;

  Json::Value payload;
  if (!claims.session_type.empty()) payload["session_type"] = claims.session_type;
  payload["role"] = claims.role;
  payload["pin"] = claims.pin;
  payload["room_id"] = claims.room_id;
  payload["player_id"] = claims.player_id;
  payload["user_id"] = claims.user_id;
  payload["exp"] = static_cast<Json::Int64>(claims.exp);

  Json::StreamWriterBuilder wb;
  wb["indentation"] = "";
  const std::string payload_json = Json::writeString(wb, payload);
  const std::string payload_enc = b64UrlEncode(payload_json);
  const std::string signature = b64UrlEncode(signPayload(payload_enc));
  return payload_enc + "." + signature;
}

std::optional<SessionClaims> VerifySessionToken(const std::string& token) {
  const auto dot = token.find('.');
  if (dot == std::string::npos) return std::nullopt;
  if (token.find('.', dot + 1) != std::string::npos) return std::nullopt;

  const std::string payload_enc = token.substr(0, dot);
  const std::string sig_enc = token.substr(dot + 1);
  if (payload_enc.empty() || sig_enc.empty()) return std::nullopt;

  const std::string expected_sig_enc = b64UrlEncode(signPayload(payload_enc));
  if (!constantTimeEq(expected_sig_enc, sig_enc)) return std::nullopt;

  auto payload_json_opt = b64UrlDecode(payload_enc);
  if (!payload_json_opt) return std::nullopt;

  Json::Value payload;
  Json::CharReaderBuilder rb;
  std::string errs;
  std::istringstream iss(*payload_json_opt);
  if (!Json::parseFromStream(rb, iss, &payload, &errs)) return std::nullopt;

  SessionClaims claims;
  claims.session_type = payload.get("session_type", "").asString();
  claims.role = payload.get("role", "").asString();
  claims.pin = payload.get("pin", "").asString();
  claims.room_id = payload.get("room_id", "").asString();
  claims.player_id = payload.get("player_id", "").asString();
  claims.user_id = payload.get("user_id", "").asString();
  claims.exp = payload.get("exp", 0).asInt64();

  if (claims.exp <= 0 || claims.role.empty()) {
    return std::nullopt;
  }

  enum class SessionType { kAuth, kGame };
  std::optional<SessionType> sessionType;
  if (claims.session_type == "auth") {
    sessionType = SessionType::kAuth;
  } else if (claims.session_type == "game" || claims.session_type.empty()) {
    sessionType = SessionType::kGame;
  } else {
    return std::nullopt;
  }

  if (!claims.session_type.empty()) {
    if (*sessionType == SessionType::kAuth) {
      if (claims.user_id.empty()) return std::nullopt;
    } else {
      if (claims.pin.empty() || claims.room_id.empty()) return std::nullopt;
    }
  } else {
    const bool looksLikeAuthSession = !claims.user_id.empty() && claims.pin.empty() && claims.room_id.empty();
    if (looksLikeAuthSession) {
      sessionType = SessionType::kAuth;
    } else {
      if (claims.pin.empty() || claims.room_id.empty()) return std::nullopt;
      sessionType = SessionType::kGame;
    }
  }

  if (*sessionType == SessionType::kAuth && claims.user_id.empty()) {
    return std::nullopt;
  }
  if (*sessionType == SessionType::kGame && (claims.pin.empty() || claims.room_id.empty())) {
    return std::nullopt;
  }

  if (unixNow() >= claims.exp) return std::nullopt;

  return claims;
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

}  // namespace security
