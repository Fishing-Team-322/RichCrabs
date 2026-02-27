#!/usr/bin/env bash
set -euo pipefail

# Быстрый цикл разработки для C++ gateway:
# - deps-образ с vcpkg собирается редко;
# - обычный rebuild gateway не компилирует весь стек зависимостей заново.

SERVICE="${SERVICE:-gateway}"
DEPS_IMAGE="${GATEWAY_DEPS_IMAGE:-devhack/gateway-deps:local}"


export DOCKER_BUILDKIT=1
export COMPOSE_DOCKER_CLI_BUILD=1


if ! docker image inspect "$DEPS_IMAGE" >/dev/null 2>&1; then
  echo "[gateway] deps image '$DEPS_IMAGE' not found locally"
  echo "[gateway] trying to pull '$DEPS_IMAGE' from registry..."
  docker pull "$DEPS_IMAGE" || true
fi

if ! docker image inspect "$DEPS_IMAGE" >/dev/null 2>&1; then
  echo "[gateway] deps image still missing, building once..."
  docker compose --profile build build gateway_deps
fi

if [[ "$SERVICE" == "all" ]]; then
  docker compose up --build -d
else
  docker compose build "$SERVICE"
  docker compose up -d "$SERVICE"
fi
