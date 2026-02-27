#pragma once

#include "config.hpp"
#include "entitlements_client.hpp"

namespace controllers {

void RegisterEntitlementsRoutes(const Config& conf, EntitlementsClient& entitlementsClient);

}  // namespace controllers
