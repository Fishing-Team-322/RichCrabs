import grpc


class DummyRpcError(grpc.RpcError):
    def __init__(self, status):
        self._status = status

    def code(self):
        return self._status


def test_me_maps_grpc_error(client, fake_clients, host_session_cookie):
    fake_clients.auth.GetMe = lambda req: (_ for _ in ()).throw(DummyRpcError(grpc.StatusCode.INTERNAL))

    response = client.get('/api/v1/me', cookies=host_session_cookie)

    assert response.status_code == 503
    assert response.json()['error'] == 'grpc_unavailable'


def test_patch_me_maps_grpc_error(client, fake_clients, host_session_cookie, csrf_headers):
    fake_clients.auth.UpdateProfile = lambda req: (_ for _ in ()).throw(DummyRpcError(grpc.StatusCode.INTERNAL))
    cookies = {**host_session_cookie, **csrf_headers['cookies']}

    response = client.patch('/api/v1/me', json={'displayName': 'x'}, cookies=cookies, headers=csrf_headers['headers'])

    assert response.status_code == 503
    assert response.json()['error'] == 'grpc_unavailable'


def test_change_password_maps_grpc_error(client, fake_clients, host_session_cookie, csrf_headers):
    fake_clients.auth.ChangePassword = lambda req: (_ for _ in ()).throw(DummyRpcError(grpc.StatusCode.INTERNAL))
    cookies = {**host_session_cookie, **csrf_headers['cookies']}

    response = client.post(
        '/api/v1/me/password',
        json={'currentPassword': 'old', 'newPassword': 'new'},
        cookies=cookies,
        headers=csrf_headers['headers'],
    )

    assert response.status_code == 503
    assert response.json()['error'] == 'grpc_unavailable'
