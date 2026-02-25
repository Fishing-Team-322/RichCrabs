#pragma once
#include <cstdint>
#include <string>

#include "csrf.hpp"
#include "session.hpp"

struct Config final {
  std::string listen_host = "0.0.0.0";
  uint16_t listen_port = 8080;

  std::string public_base_url = "http://localhost:8080";
  std::string openapi_path = "./api/openapi.yaml";
  std::string grpc_game_addr = "game:50051";
  std::string grpc_join_addr = "join:50052";
  std::string grpc_quiz_addr = "quiz:50053";
  std::string grpc_entitlements_addr = "entitlements:50054";
  std::string grpc_bot_addr = "bot:50055";
  std::string default_user_id = "00000000-0000-0000-0000-000000000001";

  int grpc_deadline_ms_create_room = 1500;
  int grpc_deadline_ms_issue_join_ticket = 1500;
  int grpc_deadline_ms_join_room = 1500;
  int grpc_deadline_ms_start_game = 1500;
  int grpc_deadline_ms_get_room_state = 1000;
  std::string app_env = "development";
  std::string session_signing_key;

  security::CsrfConfig csrf{};
  security::SessionCookieConfig session{};

  static Config LoadFromEnv();
};
