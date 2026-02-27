#pragma once

#include "config.hpp"
#include "entitlements_client.hpp"
#include "quizcore_client.hpp"

namespace controllers {

void RegisterTelegramRoutes(const Config& conf, QuizCoreClient& quizCore, EntitlementsClient& entitlementsClient);

}  // namespace controllers
