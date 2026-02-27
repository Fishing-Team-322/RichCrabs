
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
