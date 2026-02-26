#pragma once

#include "config.hpp"
#include "quizcore_client.hpp"

namespace controllers {

void RegisterServiceRoutes(const Config& conf, QuizCoreClient& quizCore);

}  // namespace controllers
