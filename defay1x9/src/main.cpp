#include <drogon/drogon.h>
#include <spdlog/spdlog.h>

#include "config.hpp"
#include "controllers/AdminController.hpp"
#include "controllers/AuthController.hpp"
#include "controllers/BotsController.hpp"
#include "controllers/GamesController.hpp"
#include "controllers/ProfileController.hpp"
#include "controllers/QuizController.hpp"
#include "controllers/TelegramController.hpp"
#include "controllers/ServiceController.hpp"
#include "csrf.hpp"
#include "quizcore_client.hpp"
#include "ws_gateway.hpp"

int main() {
  auto conf = Config::LoadFromEnv();
  security::SetSessionSigningKey(conf.session_signing_key);

  spdlog::info("listen {}:{}", conf.listen_host, conf.listen_port);
  spdlog::info("public_base_url={}", conf.public_base_url);
  spdlog::info("openapi_path={}", conf.openapi_path);

  QuizCoreClientGrpc quizCore(conf.grpc_game_addr,
                              conf.grpc_join_addr,
                              conf.grpc_bot_addr,
                              conf.grpc_deadline_ms_create_room,
                              conf.grpc_deadline_ms_issue_join_ticket,
                              conf.grpc_deadline_ms_join_room,
                              conf.grpc_deadline_ms_start_game,
                              conf.grpc_deadline_ms_pause_game,
                              conf.grpc_deadline_ms_resume_game,
                              conf.grpc_deadline_ms_next_question,
                              conf.grpc_deadline_ms_submit_answer,
                              conf.grpc_deadline_ms_get_room_state);

  controllers::RegisterServiceRoutes(conf, quizCore);
  controllers::RegisterAuthRoutes(conf);
  controllers::RegisterProfileRoutes(conf);
  controllers::RegisterQuizRoutes(conf, quizCore);
  controllers::RegisterGamesRoutes(conf, quizCore);
  controllers::RegisterBotsRoutes(conf, quizCore);
  controllers::RegisterTelegramRoutes(conf, quizCore);
  controllers::RegisterAdminRoutes(conf);

  drogon::app().addListener(conf.listen_host, conf.listen_port).run();
  return 0;
}
