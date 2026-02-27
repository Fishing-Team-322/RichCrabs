#include <drogon/drogon.h>
#include <spdlog/spdlog.h>

#include "config.hpp"
#include "controllers/AdminController.hpp"
#include "controllers/AuthController.hpp"
#include "controllers/BotsController.hpp"
#include "controllers/EntitlementsController.hpp"
#include "controllers/GamesController.hpp"
#include "controllers/ProfileController.hpp"
#include "controllers/QuizController.hpp"
#include "controllers/TelegramController.hpp"
#include "controllers/ServiceController.hpp"
#include "csrf.hpp"
#include "entitlements_client.hpp"
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
                              conf.grpc_quiz_addr,
                              conf.grpc_bot_addr,
                              conf.grpc_deadline_ms_create_room,
                              conf.grpc_deadline_ms_issue_join_ticket,
                              conf.grpc_deadline_ms_join_room,
                              conf.grpc_deadline_ms_start_game,
                              conf.grpc_deadline_ms_pause_game,
                              conf.grpc_deadline_ms_resume_game,
                              conf.grpc_deadline_ms_next_question,
                              conf.grpc_deadline_ms_submit_answer,
                              conf.grpc_deadline_ms_get_room_state,
                              conf.grpc_deadline_ms_create_quiz,
                              conf.grpc_deadline_ms_list_quizzes,
                              conf.grpc_deadline_ms_get_quiz,
                              conf.grpc_deadline_ms_update_quiz,
                              conf.grpc_deadline_ms_publish_quiz,
                              conf.grpc_deadline_ms_start_ai_quiz_job);

  EntitlementsClientGrpc entitlementsClient(conf.grpc_entitlements_addr,
                                            conf.grpc_deadline_ms_entitlements,
                                            conf.redis_url,
                                            conf.entitlements_rooms_daily_limit,
                                            conf.entitlements_bots_daily_limit,
                                            conf.entitlements_ai_daily_limit);

  controllers::RegisterServiceRoutes(conf, quizCore);
  controllers::RegisterAuthRoutes(conf);
  controllers::RegisterProfileRoutes(conf);
  controllers::RegisterQuizRoutes(conf, quizCore, entitlementsClient);
  controllers::RegisterGamesRoutes(conf, quizCore, entitlementsClient);
  controllers::RegisterBotsRoutes(conf, quizCore, entitlementsClient);
  controllers::RegisterTelegramRoutes(conf, quizCore, entitlementsClient);
  controllers::RegisterEntitlementsRoutes(conf, entitlementsClient);
  controllers::RegisterAdminRoutes(conf);

  drogon::app().addListener(conf.listen_host, conf.listen_port).run();
  return 0;
}
