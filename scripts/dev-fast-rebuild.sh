#!/usr/bin/env bash
set -euo pipefail

# Быстрый цикл разработки: не удаляем тома и не выключаем кеш сборки.
# Использование:
#   scripts/dev-fast-rebuild.sh            # rebuild только gateway
#   SERVICE=gateway scripts/dev-fast-rebuild.sh
#   SERVICE=all scripts/dev-fast-rebuild.sh

SERVICE="${SERVICE:-gateway}"

export DOCKER_BUILDKIT=1
export COMPOSE_DOCKER_CLI_BUILD=1

if [[ "$SERVICE" == "all" ]]; then
  docker compose up --build -d
else
  docker compose build "$SERVICE"
  docker compose up -d "$SERVICE"
fi
