import grpc

from app import main


class DummyRpcError(grpc.RpcError):
    def __init__(self, status):
        self._status = status

    def code(self):
        return self._status


def test_csrf_mismatch_returns_403(client):
    response = client.post(
        "/api/v1/auth/login",
        json={"email": "a@b.c", "password": "x"},
        cookies={main.settings.csrf_cookie_name: "a"},
        headers={main.settings.csrf_header_name: "b"},
    )
    assert response.status_code == 403
    assert response.json()["error"] == "csrf_required"


def test_auth_login_happy_path(client, csrf_headers):
    response = client.post(
        "/api/v1/auth/login",
        json={"email": "a@b.c", "password": "x"},
        cookies=csrf_headers["cookies"],
        headers=csrf_headers["headers"],
    )
    assert response.status_code == 200
    assert response.json()["user"]["id"] == "u1"
    assert "csrfToken" in response.json()


def test_auth_login_content_length_matches_body(client, csrf_headers):
    response = client.post(
        "/api/v1/auth/login",
        json={"email": "a@b.c", "password": "x"},
        cookies=csrf_headers["cookies"],
        headers=csrf_headers["headers"],
    )
    assert response.status_code == 200
    assert int(response.headers["content-length"]) == len(response.content)


def test_auth_register_content_length_matches_body(client, csrf_headers):
    response = client.post(
        "/api/v1/auth/register",
        json={"email": "new@b.c", "password": "x", "displayName": "New"},
        cookies=csrf_headers["cookies"],
        headers=csrf_headers["headers"],
    )
    assert response.status_code == 200
    assert int(response.headers["content-length"]) == len(response.content)


def test_grpc_error_is_mapped_for_register(client, fake_clients, csrf_headers):
    fake_clients.auth.Register = lambda req: (_ for _ in ()).throw(DummyRpcError(grpc.StatusCode.INVALID_ARGUMENT))
    response = client.post(
        "/api/v1/auth/register",
        json={"email": "bad", "password": "x", "displayName": "x"},
        cookies=csrf_headers["cookies"],
        headers=csrf_headers["headers"],
    )
    assert response.status_code == 400
    assert response.json()["error"] == "validation_error"
