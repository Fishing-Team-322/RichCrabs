#!/usr/bin/env python3
import argparse
import json
import sys
from http.cookies import SimpleCookie
from urllib.parse import urlparse

import requests
import websocket


def parse_set_cookie(headers):
    cookie = SimpleCookie()
    for value in headers.get('Set-Cookie', '').split(','):
        if value.strip():
            try:
                cookie.load(value)
            except Exception:
                pass
    return {k: v.value for k, v in cookie.items()}


def ws_url(base_url: str) -> str:
    parsed = urlparse(base_url)
    scheme = 'wss' if parsed.scheme == 'https' else 'ws'
    return f"{scheme}://{parsed.netloc}/ws"


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--base-url', default='http://127.0.0.1:8080')
    parser.add_argument('--quiz-id', default='quiz-default')
    parser.add_argument('--title', default='Smoke game')
    args = parser.parse_args()

    session = requests.Session()

    create = session.post(
        f"{args.base_url}/api/v1/games",
        json={'quizId': args.quiz_id, 'title': args.title},
        timeout=10,
    )
    create.raise_for_status()
    game = create.json()
    pin = game['pin']

    player = requests.Session()
    join = player.post(
        f"{args.base_url}/api/v1/games/{pin}/join",
        json={'name': 'smoke-player'},
        timeout=10,
    )
    join.raise_for_status()
    join_payload = join.json()
    player_id = join_payload['playerId']

    player_cookie = '; '.join([f"{k}={v}" for k, v in player.cookies.get_dict().items()])
    ws = websocket.create_connection(ws_url(args.base_url), header=[f"Cookie: {player_cookie}"])
    hello = json.loads(ws.recv())
    if hello.get('type') != 'hello':
        raise RuntimeError(f'unexpected ws hello: {hello}')

    csrf = session.get(f"{args.base_url}/csrf", timeout=10)
    csrf.raise_for_status()
    token = csrf.json()['token']
    start = session.post(
        f"{args.base_url}/api/v1/games/{pin}/start",
        headers={'X-XSRF-TOKEN': token},
        timeout=10,
    )
    if start.status_code not in (200, 204):
        raise RuntimeError(f'start failed: {start.status_code} {start.text}')

    event_seen = False
    for _ in range(5):
        msg = json.loads(ws.recv())
        if msg.get('type') == 'room_event':
            event_seen = True
            break

    ws.send(json.dumps({'type': 'submit_answer', 'question_id': 'q1', 'answer': '42'}))
    answer_result = json.loads(ws.recv())
    if answer_result.get('type') != 'submit_answer_result':
        raise RuntimeError(f'unexpected submit answer response: {answer_result}')

    ws.close()

    if not event_seen:
        raise RuntimeError('room_event was not observed')

    print(json.dumps({'ok': True, 'pin': pin, 'playerId': player_id, 'eventSeen': event_seen}))


if __name__ == '__main__':
    try:
        main()
    except Exception as exc:
        print(json.dumps({'ok': False, 'error': str(exc)}))
        sys.exit(1)
