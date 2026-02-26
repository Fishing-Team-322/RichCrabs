#pragma once

#include "config.hpp"
#include "quizcore_client.hpp"

namespace controllers {

void RegisterGamesRoutes(const Config& conf, QuizCoreClient& quizCore);

}  // namespace controllers
