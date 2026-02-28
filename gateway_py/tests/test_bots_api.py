def test_register_bot_requires_auth(client, csrf_headers):
    response = client.post(
        "/api/v1/bots",
        json={"name": "B", "version": "1", "endpoint": "http://bot"},
        cookies=csrf_headers["cookies"],
        headers=csrf_headers["headers"],
    )
    assert response.status_code == 401


def test_register_bot_happy_path(client, host_session_cookie, csrf_headers):
    cookies = {**host_session_cookie, **csrf_headers["cookies"]}
    response = client.post(
        "/api/v1/bots",
        json={"name": "B", "version": "1", "endpoint": "http://bot"},
        cookies=cookies,
        headers=csrf_headers["headers"],
    )
    assert response.status_code == 200
    assert response.json()["bot"]["botId"] == "b1"


def test_list_bots_happy_path(client, host_session_cookie):
    response = client.get("/api/v1/bots", cookies=host_session_cookie)
    assert response.status_code == 200
    assert len(response.json()["bots"]) == 1


def test_tg_connect_requires_auth(client, csrf_headers):
    response = client.post(
        "/api/v1/telegram/bots/connect",
        json={"token": "123:abc"},
        cookies=csrf_headers["cookies"],
        headers=csrf_headers["headers"],
    )
    assert response.status_code == 401


def test_tg_connect_validates_payload(client, host_session_cookie, csrf_headers):
    cookies = {**host_session_cookie, **csrf_headers["cookies"]}
    response = client.post(
        "/api/v1/telegram/bots/connect",
        json={"token": "bad-token"},
        cookies=cookies,
        headers=csrf_headers["headers"],
    )
    assert response.status_code == 422


def test_tg_connect_status_unbind_happy_path(client, host_session_cookie, csrf_headers):
    cookies = {**host_session_cookie, **csrf_headers["cookies"]}
    connect = client.post(
        "/api/v1/telegram/bots/connect",
        json={"token": "123:abc"},
        cookies=cookies,
        headers=csrf_headers["headers"],
    )
    assert connect.status_code == 200
    body = connect.json()
    assert body["botId"] == "b1"
    assert body["status"] == "connected"

    from app.services.bot_service import binding_key, rdb
    import json

    stored = rdb.get(binding_key("b1"))
    parsed = json.loads(stored)
    assert "token" not in parsed
    assert parsed.get("tokenCiphertext")
    assert parsed.get("tokenNonce")
    assert parsed.get("tokenKeyVersion")

    status = client.get("/api/v1/telegram/bots/status", cookies=host_session_cookie)
    assert status.status_code == 200
    status_body = status.json()
    assert status_body.get("bindingId", status_body.get("botId")) == "b1"
    assert status_body["botId"] == "b1"
    assert status_body["active"] is True
    assert isinstance(status_body.get("operations", []), list)

    unbind = client.delete(
        "/api/v1/telegram/bots/b1",
        cookies=cookies,
        headers=csrf_headers["headers"],
    )
    assert unbind.status_code == 204


def test_tg_status_requires_auth(client):
    status = client.get("/api/v1/telegram/bots/status")
    assert status.status_code == 401


def test_tg_unbind_requires_auth(client, csrf_headers):
    response = client.delete(
        "/api/v1/telegram/bots/b1",
        cookies=csrf_headers["cookies"],
        headers=csrf_headers["headers"],
    )
    assert response.status_code == 401


def test_tg_connect_and_webhook_flow(client, host_session_cookie, csrf_headers):
    cookies = {**host_session_cookie, **csrf_headers["cookies"]}
    connect = client.post(
        "/api/v1/telegram/bots/connect",
        json={"token": "123:abc"},
        cookies=cookies,
        headers=csrf_headers["headers"],
    )
    assert connect.status_code == 200
    secret = connect.json()["webhookUrl"].rsplit("/", 1)[-1]

    webhook = client.post(
        f"/api/v1/telegram/webhook/b1/{secret}",
        json={"message": {"text": "/pin", "chat": {"id": 1}}},
        headers={"x-telegram-bot-api-secret-token": secret},
    )
    assert webhook.status_code == 200
    assert webhook.json()["status"] == "processed"


def test_tg_webhook_missing_secret_header(client):
    webhook = client.post(
        "/api/v1/telegram/webhook/b1/secret",
        json={"message": {"text": "/pin", "chat": {"id": 1}}},
    )
    assert webhook.status_code == 401


def test_tg_webhook_wrong_secret_header(client, host_session_cookie, csrf_headers):
    cookies = {**host_session_cookie, **csrf_headers["cookies"]}
    connect = client.post(
        "/api/v1/telegram/bots/connect",
        json={"token": "123:abc"},
        cookies=cookies,
        headers=csrf_headers["headers"],
    )
    secret = connect.json()["webhookUrl"].rsplit("/", 1)[-1]

    webhook = client.post(
        f"/api/v1/telegram/webhook/b1/{secret}",
        json={"message": {"text": "/pin", "chat": {"id": 1}}},
        headers={"x-telegram-bot-api-secret-token": "wrong"},
    )
    assert webhook.status_code == 403


def test_tg_webhook_wrong_bot_id_secret_pair(client):
    webhook = client.post(
        "/api/v1/telegram/webhook/missing-bot/secret",
        json={"message": {"text": "/pin", "chat": {"id": 1}}},
        headers={"x-telegram-bot-api-secret-token": "secret"},
    )
    assert webhook.status_code == 404


def test_tg_webhook_migrates_legacy_plaintext_binding(client, fake_rdb):
    import json
    from app.services.bot_service import binding_key

    fake_rdb.set(binding_key("b1"), json.dumps({"userId": "u1", "secret": "secret", "token": "123:abc"}))

    webhook = client.post(
        "/api/v1/telegram/webhook/b1/secret",
        json={"message": {"text": "/pin", "chat": {"id": 1}}},
        headers={"x-telegram-bot-api-secret-token": "secret"},
    )

    assert webhook.status_code == 200
    assert webhook.json()["status"] == "processed"

    migrated = json.loads(fake_rdb.get(binding_key("b1")))
    assert "token" not in migrated
    assert migrated.get("tokenCiphertext")
    assert migrated.get("tokenNonce")
    assert migrated.get("tokenKeyVersion")
