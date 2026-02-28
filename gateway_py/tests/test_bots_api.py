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


def test_tg_connect_validates_payload(client, host_session_cookie, csrf_headers):
    cookies = {**host_session_cookie, **csrf_headers["cookies"]}
    response = client.post(
        "/api/v1/telegram/bots/connect",
        json={"token": "bad-token"},
        cookies=cookies,
        headers=csrf_headers["headers"],
    )
    assert response.status_code == 422


def test_tg_connect_and_webhook_flow(client, host_session_cookie, csrf_headers):
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

    webhook = client.post(
        "/api/v1/telegram/webhook/b1/secret",
        json={"message": {"text": "/pin", "chat": {"id": 1}}},
        headers={"x-telegram-bot-api-secret-token": "secret"},
    )
    assert webhook.status_code == 200
    assert webhook.json()["status"] == "processed"


def test_tg_status_and_unbind(client, host_session_cookie, csrf_headers):
    cookies = {**host_session_cookie, **csrf_headers["cookies"]}
    client.post(
        "/api/v1/telegram/bots/connect",
        json={"token": "123:abc"},
        cookies=cookies,
        headers=csrf_headers["headers"],
    )

    status = client.get("/api/v1/telegram/bots/status", cookies=host_session_cookie)
    assert status.status_code == 200
    assert status.json()["active"] is True

    unbind = client.delete(
        "/api/v1/telegram/bots/b1",
        cookies=cookies,
        headers=csrf_headers["headers"],
    )
    assert unbind.status_code == 204
