#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://127.0.0.1:8080}"
BOT_ID="${BOT_ID:-}"
WEBHOOK_SECRET="${WEBHOOK_SECRET:-}"
WRONG_BOT_ID="${WRONG_BOT_ID:-missing-bot}"

if [[ -z "$BOT_ID" || -z "$WEBHOOK_SECRET" ]]; then
  echo "BOT_ID and WEBHOOK_SECRET are required" >&2
  exit 2
fi

payload='{"update_id":1,"message":{"text":"/pin","chat":{"id":1},"message_id":1}}'

assert_code() {
  local actual="$1"
  local expected="$2"
  local title="$3"
  if [[ "$actual" != "$expected" ]]; then
    echo "FAIL: $title (expected $expected, got $actual)" >&2
    exit 1
  fi
  echo "PASS: $title ($actual)"
}

missing_header_code="$(curl -sS -o /dev/null -w '%{http_code}' \
  -X POST "$BASE_URL/api/v1/telegram/webhook/$BOT_ID/$WEBHOOK_SECRET" \
  -H 'Content-Type: application/json' \
  -d "$payload")"
assert_code "$missing_header_code" "401" "missing x-telegram-bot-api-secret-token"

wrong_header_code="$(curl -sS -o /dev/null -w '%{http_code}' \
  -X POST "$BASE_URL/api/v1/telegram/webhook/$BOT_ID/$WEBHOOK_SECRET" \
  -H 'Content-Type: application/json' \
  -H 'x-telegram-bot-api-secret-token: wrong-secret' \
  -d "$payload")"
assert_code "$wrong_header_code" "403" "wrong x-telegram-bot-api-secret-token"

wrong_pair_code="$(curl -sS -o /dev/null -w '%{http_code}' \
  -X POST "$BASE_URL/api/v1/telegram/webhook/$WRONG_BOT_ID/$WEBHOOK_SECRET" \
  -H 'Content-Type: application/json' \
  -H "x-telegram-bot-api-secret-token: $WEBHOOK_SECRET" \
  -d "$payload")"
assert_code "$wrong_pair_code" "404" "wrong bot_id/secret pair"
