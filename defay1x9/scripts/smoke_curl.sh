#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:8080}"
OWNER_ID="${OWNER_ID:-00000000-0000-0000-0000-000000000001}"

create_resp=$(curl -sS -X POST "$BASE_URL/api/v1/games" \
  -H 'Content-Type: application/json' \
  -d "{\"ownerUserId\":\"$OWNER_ID\",\"quizId\":\"demo-quiz\",\"title\":\"Smoke game\"}")

echo "Create game response: $create_resp"
pin=$(echo "$create_resp" | jq -r '.pin')
invite_token=$(echo "$create_resp" | jq -r '.inviteToken')

curl -sS -X POST "$BASE_URL/api/v1/games/$pin/join" \
  -H 'Content-Type: application/json' \
  -d '{"name":"Smoke Player"}' | jq .

curl -sS -X POST "$BASE_URL/api/v1/invites/$invite_token/join" \
  -H 'Content-Type: application/json' \
  -d '{"name":"Invite Player"}' | jq .

curl -sS -X POST "$BASE_URL/api/v1/bots" \
  -H 'Content-Type: application/json' \
  -d '{"name":"Smoke Bot","version":"1.0.0","endpoint":"https://example.org/hook"}' | jq .

curl -sS "$BASE_URL/health?grpc=true" | jq .
