import grpc


class DummyRpcError(grpc.RpcError):
    def __init__(self, status):
        self._status = status

    def code(self):
        return self._status


def test_list_games_without_session_returns_empty_list(client):
    response = client.get("/api/v1/games")
    assert response.status_code == 200
    assert response.json() == []


def test_list_games_with_host_session_returns_active_room(client, host_session_cookie):
    response = client.get("/api/v1/games", cookies=host_session_cookie)
    assert response.status_code == 200
    payload = response.json()
    assert len(payload) == 1
    assert payload[0]["pin"] == "123456"
    assert payload[0]["roomId"] == "room-1"


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
    assert response.json()["invitePath"] == "/invite/inv1"
    assert response.json()["inviteQrSvg"].startswith("<svg")




def test_regenerate_invite_requires_host_session(client, csrf_headers):
    response = client.post('/api/v1/games/123456/invite/regenerate', cookies=csrf_headers['cookies'], headers=csrf_headers['headers'])
    assert response.status_code == 401


def test_regenerate_invite_returns_404_for_unknown_host_room(client, host_session_cookie, csrf_headers):
    cookies = {**host_session_cookie, **csrf_headers['cookies']}
    response = client.post('/api/v1/games/999999/invite/regenerate', cookies=cookies, headers=csrf_headers['headers'])
    assert response.status_code == 404

def test_regenerate_invite_happy_path(client, host_session_cookie, csrf_headers):
    cookies = {**host_session_cookie, **csrf_headers["cookies"]}
    response = client.post("/api/v1/games/123456/invite/regenerate", cookies=cookies, headers=csrf_headers["headers"])
    assert response.status_code == 200
    assert response.json()["inviteToken"] == "inv2"
    assert response.json()["invitePath"] == "/invite/inv2"


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


def test_host_action_maps_grpc_precondition_error(client, host_session_cookie, csrf_headers, fake_clients):
    fake_clients.game.StartGame = lambda req: (_ for _ in ()).throw(DummyRpcError(grpc.StatusCode.FAILED_PRECONDITION))
    cookies = {**host_session_cookie, **csrf_headers["cookies"]}
    response = client.post("/api/v1/games/123456/start", cookies=cookies, headers=csrf_headers["headers"])
    assert response.status_code == 409
    assert response.json()["error"] == "validation_error"
