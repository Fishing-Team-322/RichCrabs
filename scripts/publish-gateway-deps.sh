#!/usr/bin/env bash
set -euo pipefail

echo "Deprecated: gateway_deps image flow removed."
echo "Use: export DOCKER_BUILDKIT=1 COMPOSE_DOCKER_CLI_BUILD=1 && docker compose up -d --build"
