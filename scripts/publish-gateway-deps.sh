#!/usr/bin/env bash
set -euo pipefail

# Собирает и публикует deps-образ с vcpkg зависимостями.
# Это главный способ ускорить сборку на других компьютерах в 2-3+ раза:
# они делают docker pull вместо локальной компиляции grpc/protobuf/drogon.

DEPS_IMAGE="${GATEWAY_DEPS_IMAGE:-ghcr.io/fishing-team-322/richcrabs-gateway-deps:latest}"

export DOCKER_BUILDKIT=1
export COMPOSE_DOCKER_CLI_BUILD=1

GATEWAY_DEPS_IMAGE="$DEPS_IMAGE" docker compose --profile build build gateway_deps

docker tag devhack/gateway-deps:local "$DEPS_IMAGE"
docker push "$DEPS_IMAGE"

echo "Published: $DEPS_IMAGE"
