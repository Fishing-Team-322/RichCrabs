import grpc


class DummyRpcError(grpc.RpcError):
    def __init__(self, status):
        self._status = status

    def code(self):
        return self._status


def test_create_game_requires_valid_session(client, csrf_headers):
    response = client.post(
        "/api/v1/games",
        json={"ownerUserId": "u1", "quizId": "q1", "title": "T"},
        cookies=csrf_headers["cookies"],
        headers=csrf_headers["headers"],
    )
    assert response.status_code == 403


def test_create_game_happy_path(client, host_session_cookie, csrf_headers):
    cookies = {**host_session_cookie, **csrf_headers["cookies"]}
    response = client.post(
        "/api/v1/games",
        json={"ownerUserId": "u1", "quizId": "q1", "title": "T"},
        cookies=cookies,
        headers=csrf_headers["headers"],
    )
    assert response.status_code == 200
    assert response.json()["pin"] == "123456"


def test_create_game_grpc_mapped_error(client, host_session_cookie, fake_clients, csrf_headers):
    fake_clients.game.CreateRoom = lambda req: (_ for _ in ()).throw(DummyRpcError(grpc.StatusCode.NOT_FOUND))
    cookies = {**host_session_cookie, **csrf_headers["cookies"]}
    response = client.post(
        "/api/v1/games",
        json={"ownerUserId": "u1", "quizId": "q-missing", "title": "T"},
        cookies=cookies,
        headers=csrf_headers["headers"],
    )
    assert response.status_code == 404


def test_player_only_leave_role_enforced(client, host_session_cookie, csrf_headers):
    cookies = {**host_session_cookie, **csrf_headers["cookies"]}
    response = client.post("/api/v1/games/123456/leave", cookies=cookies, headers=csrf_headers["headers"])
    assert response.status_code == 403


def test_game_state_missing_session_returns_401(client):
    response = client.get("/api/v1/games/123456/state")
    assert response.status_code == 401


def test_host_action_requires_host_role(client, player_session_cookie, csrf_headers):
    cookies = {**player_session_cookie, **csrf_headers["cookies"]}
    response = client.post("/api/v1/games/123456/start", cookies=cookies, headers=csrf_headers["headers"])
    assert response.status_code == 401
