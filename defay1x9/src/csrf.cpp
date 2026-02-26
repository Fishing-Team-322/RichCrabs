#include "csrf.hpp"
#include "random.hpp"

#include <drogon/Cookie.h>

namespace security {

std::string IssueCsrfToken() {
  return util::random_hex(32);
}

void SetCsrfCookie(const drogon::HttpResponsePtr& resp, const CsrfConfig& cfg, const std::string& token) {
  drogon::Cookie c(cfg.cookie_name, token);
  c.setPath(cfg.cookie_path);
  c.setSecure(cfg.cookie_secure);
  c.setHttpOnly(cfg.cookie_http_only);
  c.setSameSite(drogon::Cookie::SameSite::kLax);
  resp->addCookie(c);
}

void ClearCsrfCookie(const drogon::HttpResponsePtr& resp, const CsrfConfig& cfg) {
  drogon::Cookie c(cfg.cookie_name, "");
  c.setPath(cfg.cookie_path);
  c.setSecure(cfg.cookie_secure);
  c.setHttpOnly(cfg.cookie_http_only);
  c.setSameSite(drogon::Cookie::SameSite::kLax);
  c.setMaxAge(0);
  resp->addCookie(c);
}

bool VerifyCsrf(const drogon::HttpRequestPtr& req, const CsrfConfig& cfg) {
  const auto cookie = req->getCookie(cfg.cookie_name);
  const auto hdr = req->getHeader(cfg.header_name);
  return !cookie.empty() && !hdr.empty() && cookie == hdr;
}

} // namespace security
