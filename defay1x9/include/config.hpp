#pragma once
#include <cstdint>
#include <string>
#include <unordered_set>

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
  std::string grpc_auth_addr = "auth:50056";
  std::string default_user_id = "00000000-0000-0000-0000-000000000001";

  int grpc_deadline_ms_create_room = 1500;
  int grpc_deadline_ms_issue_join_ticket = 1500;
  int grpc_deadline_ms_join_room = 1500;
  int grpc_deadline_ms_start_game = 1500;
  int grpc_deadline_ms_pause_game = 1500;
  int grpc_deadline_ms_resume_game = 1500;
  int grpc_deadline_ms_next_question = 1500;
  int grpc_deadline_ms_submit_answer = 1500;
  int grpc_deadline_ms_get_room_state = 1000;
  int grpc_deadline_ms_create_quiz = 1500;
  int grpc_deadline_ms_list_quizzes = 1500;
  int grpc_deadline_ms_get_quiz = 1500;
  int grpc_deadline_ms_update_quiz = 1500;
  int grpc_deadline_ms_publish_quiz = 1500;
  int grpc_deadline_ms_start_ai_quiz_job = 1500;
  int grpc_deadline_ms_entitlements = 1200;
  int grpc_deadline_ms_auth = 1200;
  std::string redis_url = "redis://redis:6379";
  std::string database_url = "postgres://richcrab:richcrab@postgres:5432/richcrab";
  std::unordered_set<std::string> admin_emails;
  uint64_t entitlements_rooms_daily_limit = 10;
  uint64_t entitlements_bots_daily_limit = 20;
  uint64_t entitlements_ai_daily_limit = 30;
  bool ws_mock_stream_enabled = false;
  bool ws_mock_stream_auto_on_unavailable = true;
  std::string app_env = "development";
  std::string session_signing_key;

  security::CsrfConfig csrf{};
  security::SessionCookieConfig session{};

  static Config LoadFromEnv();
};
