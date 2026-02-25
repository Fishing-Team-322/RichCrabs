#pragma once
#include <cstdint>
#include <string>

struct Config final {
  std::string listen_host = "0.0.0.0";
  uint16_t listen_port = 8080;

  std::string public_base_url = "http://localhost:8080";
  std::string jwt_secret = "dev-secret-change-me";
  int jwt_ttl_seconds = 24 * 3600;

  // путь к api/openapi.yaml (относительно текущей рабочей папки)
  std::string openapi_path = "./api/openapi.yaml";

  static Config LoadFromEnv();
};