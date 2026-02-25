#pragma once
#include <drogon/HttpRequest.h>
#include <drogon/HttpResponse.h>
#include <string>

namespace security {

struct CsrfConfig final {
  std::string cookie_name = "XSRF-TOKEN";
  std::string header_name = "X-XSRF-TOKEN";
  bool cookie_secure = false;
  bool cookie_http_only = false; // обычно false, чтобы фронт мог прочитать токен
  std::string cookie_path = "/";
};

std::string IssueCsrfToken();
void SetCsrfCookie(const drogon::HttpResponsePtr& resp, const CsrfConfig& cfg, const std::string& token);
bool VerifyCsrf(const drogon::HttpRequestPtr& req, const CsrfConfig& cfg);

} // namespace security