#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://127.0.0.1:8080}"
QUIZ_ID="${QUIZ_ID:-quiz-default}"
TITLE="${TITLE:-Smoke game}"

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "missing required command: $1" >&2
    exit 1
  }
}

require_cmd curl
require_cmd jq
require_cmd websocat

HOST_COOKIES="$(mktemp)"
PLAYER_COOKIES="$(mktemp)"
LISTENER_OUT="$(mktemp)"
trap 'rm -f "$HOST_COOKIES" "$PLAYER_COOKIES" "$LISTENER_OUT"' EXIT

create_payload="$(jq -nc --arg quizId "$QUIZ_ID" --arg title "$TITLE" '{quizId:$quizId,title:$title}')"
create_resp="$(curl -sS -f -c "$HOST_COOKIES" -H 'Content-Type: application/json' -d "$create_payload" "$BASE_URL/api/v1/games")"
pin="$(jq -r '.pin' <<<"$create_resp")"

join_payload='{"name":"smoke-player"}'
join_resp="$(curl -sS -f -c "$PLAYER_COOKIES" -H 'Content-Type: application/json' -d "$join_payload" "$BASE_URL/api/v1/games/$pin/join")"
player_id="$(jq -r '.playerId' <<<"$join_resp")"

player_cookie="$(awk 'NR>1 && $6 != "" {printf "%s=%s;", $6, $7}' "$PLAYER_COOKIES" | sed 's/;$//')"
ws_url="${BASE_URL/http/ws}/ws"
ws_url="${ws_url/https/wss}"

(timeout 12s websocat -H "Cookie: $player_cookie" "$ws_url" >"$LISTENER_OUT" 2>/dev/null) &
listener_pid=$!
sleep 1

if ! kill -0 "$listener_pid" 2>/dev/null; then
  echo "websocket listener failed to start" >&2
  exit 1
fi

csrf_resp="$(curl -sS -f -b "$HOST_COOKIES" -c "$HOST_COOKIES" "$BASE_URL/csrf")"
csrf_token="$(jq -r '.token' <<<"$csrf_resp")"

curl -sS -o /dev/null -w '%{http_code}' -f \
  -b "$HOST_COOKIES" \
  -H "X-XSRF-TOKEN: $csrf_token" \
  -X POST "$BASE_URL/api/v1/games/$pin/start" >/dev/null

submit_resp="$(printf '%s\n' '{"type":"submit_answer","question_id":"q1","answer":"42"}' | timeout 8s websocat -1 -H "Cookie: $player_cookie" "$ws_url" 2>/dev/null || true)"

wait "$listener_pid" || true

if ! grep -q '"type":"hello"' "$LISTENER_OUT"; then
  echo "no hello frame observed" >&2
  exit 1
fi

if ! grep -q '"type":"room_event"' "$LISTENER_OUT"; then
  echo "room_event was not observed" >&2
  exit 1
fi

if ! grep -q '"type":"submit_answer_result"' <<<"$submit_resp"; then
  echo "unexpected submit_answer response: $submit_resp" >&2
  exit 1
fi

jq -nc --arg pin "$pin" --arg playerId "$player_id" '{ok:true,pin:$pin,playerId:$playerId,eventSeen:true}'
