#pragma once
#include <cstdint>
#include <string>
#include "csrf.hpp"

struct Config final {
  std::string listen_host = "0.0.0.0";
  uint16_t listen_port = 8080;

  std::string public_base_url = "http://localhost:8080";
  std::string openapi_path = "./api/openapi.yaml";

  // CSRF
  security::CsrfConfig csrf{};

  static Config LoadFromEnv();
};