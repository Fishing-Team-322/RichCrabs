#include "config.hpp"
#include <cstdlib>
#include <stdexcept>

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
  c.grpc_game_addr = envStr("GW_GRPC_GAME_ADDR", c.grpc_game_addr);
  c.grpc_join_addr = envStr("GW_GRPC_JOIN_ADDR", c.grpc_join_addr);
  c.grpc_quiz_addr = envStr("GW_GRPC_QUIZ_ADDR", c.grpc_quiz_addr);
  c.grpc_entitlements_addr = envStr("GW_GRPC_ENTITLEMENTS_ADDR", c.grpc_entitlements_addr);
  c.grpc_bot_addr = envStr("GW_GRPC_BOT_ADDR", c.grpc_bot_addr);
  c.default_user_id = envStr("GW_DEFAULT_USER_ID", c.default_user_id);

  c.grpc_deadline_ms_create_room = envInt("GW_GRPC_DEADLINE_MS_CREATE_ROOM", c.grpc_deadline_ms_create_room);
  c.grpc_deadline_ms_issue_join_ticket = envInt("GW_GRPC_DEADLINE_MS_ISSUE_JOIN_TICKET", c.grpc_deadline_ms_issue_join_ticket);
  c.grpc_deadline_ms_join_room = envInt("GW_GRPC_DEADLINE_MS_JOIN_ROOM", c.grpc_deadline_ms_join_room);
  c.grpc_deadline_ms_start_game = envInt("GW_GRPC_DEADLINE_MS_START_GAME", c.grpc_deadline_ms_start_game);
  c.grpc_deadline_ms_pause_game = envInt("GW_GRPC_DEADLINE_MS_PAUSE_GAME", c.grpc_deadline_ms_pause_game);
  c.grpc_deadline_ms_resume_game = envInt("GW_GRPC_DEADLINE_MS_RESUME_GAME", c.grpc_deadline_ms_resume_game);
  c.grpc_deadline_ms_next_question = envInt("GW_GRPC_DEADLINE_MS_NEXT_QUESTION", c.grpc_deadline_ms_next_question);
  c.grpc_deadline_ms_submit_answer = envInt("GW_GRPC_DEADLINE_MS_SUBMIT_ANSWER", c.grpc_deadline_ms_submit_answer);
  c.grpc_deadline_ms_get_room_state = envInt("GW_GRPC_DEADLINE_MS_GET_ROOM_STATE", c.grpc_deadline_ms_get_room_state);
  c.grpc_deadline_ms_create_quiz = envInt("GW_GRPC_DEADLINE_MS_CREATE_QUIZ", c.grpc_deadline_ms_create_quiz);
  c.grpc_deadline_ms_list_quizzes = envInt("GW_GRPC_DEADLINE_MS_LIST_QUIZZES", c.grpc_deadline_ms_list_quizzes);
  c.grpc_deadline_ms_get_quiz = envInt("GW_GRPC_DEADLINE_MS_GET_QUIZ", c.grpc_deadline_ms_get_quiz);
  c.grpc_deadline_ms_update_quiz = envInt("GW_GRPC_DEADLINE_MS_UPDATE_QUIZ", c.grpc_deadline_ms_update_quiz);
  c.grpc_deadline_ms_publish_quiz = envInt("GW_GRPC_DEADLINE_MS_PUBLISH_QUIZ", c.grpc_deadline_ms_publish_quiz);
  c.grpc_deadline_ms_start_ai_quiz_job = envInt("GW_GRPC_DEADLINE_MS_START_AI_QUIZ_JOB", c.grpc_deadline_ms_start_ai_quiz_job);
  c.grpc_deadline_ms_entitlements = envInt("GW_GRPC_DEADLINE_MS_ENTITLEMENTS", c.grpc_deadline_ms_entitlements);
  c.redis_url = envStr("GW_REDIS_URL", c.redis_url);
  c.entitlements_rooms_daily_limit = static_cast<uint64_t>(envInt("GW_ENT_LIMIT_ROOMS_DAILY", static_cast<int>(c.entitlements_rooms_daily_limit)));
  c.entitlements_bots_daily_limit = static_cast<uint64_t>(envInt("GW_ENT_LIMIT_BOTS_DAILY", static_cast<int>(c.entitlements_bots_daily_limit)));
  c.entitlements_ai_daily_limit = static_cast<uint64_t>(envInt("GW_ENT_LIMIT_AI_DAILY", static_cast<int>(c.entitlements_ai_daily_limit)));
  c.ws_mock_stream_enabled = envBool("GW_WS_MOCK_STREAM_ENABLED", c.ws_mock_stream_enabled);
  c.ws_mock_stream_auto_on_unavailable = envBool("GW_WS_MOCK_STREAM_AUTO_ON_UNAVAILABLE", c.ws_mock_stream_auto_on_unavailable);
  c.app_env = envStr("GW_ENV", c.app_env);
  c.session_signing_key = envStr("GW_SESSION_SIGNING_KEY", "");

  if (c.app_env == "production" && c.session_signing_key.empty()) {
    throw std::runtime_error("GW_SESSION_SIGNING_KEY is required in production");
  }
  if (c.session_signing_key.empty()) {
    c.session_signing_key = "dev-insecure-session-key";
  }

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
