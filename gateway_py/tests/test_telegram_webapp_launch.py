import base64
import hashlib
import hmac
import json
import time

from app import main


def _sign(payload_b64: str) -> str:
    return base64.urlsafe_b64encode(
        hmac.new(
            main.settings.telegram_webapp_signing_key.encode(),
            payload_b64.encode(),
            hashlib.sha256,
        ).digest()
    ).decode().rstrip("=")


def _payload(exp: int):
    data = {
        "bot_id": "b1",
        "user_id": 123,
        "chat_id": 456,
        "request_id": "req-1",
        "exp": exp,
    }
    return base64.urlsafe_b64encode(json.dumps(data).encode()).decode().rstrip("=")


def test_telegram_webapp_launch_sets_session_cookie_and_redirects(client):
    payload = _payload(int(time.time()) + 60)
    response = client.get(
        f"/api/v1/telegram/webapp/launch?payload={payload}&sig={_sign(payload)}",
        follow_redirects=False,
    )
    assert response.status_code == 302
    assert response.headers["location"] == main.settings.telegram_webapp_quiz_url
    assert main.settings.session_cookie_name in response.cookies


def test_telegram_webapp_launch_rejects_invalid_signature(client):
    payload = _payload(int(time.time()) + 60)
    response = client.get(
        f"/api/v1/telegram/webapp/launch?payload={payload}&sig=bad-signature",
    )
    assert response.status_code == 401
    assert response.json()["error"] == "invalid_signature"


def test_telegram_webapp_launch_rejects_expired_token(client):
    payload = _payload(int(time.time()) - 1)
    response = client.get(
        f"/api/v1/telegram/webapp/launch?payload={payload}&sig={_sign(payload)}",
    )
    assert response.status_code == 401
    assert response.json()["error"] == "expired"
