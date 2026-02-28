
def test_healthz_alias_returns_ok(client):
    response = client.get('/api/v1/healthz')
    assert response.status_code == 200
    assert response.json()['status'] == 'ok'


def test_session_returns_guest_without_cookie(client):
    response = client.get('/api/v1/session')
    assert response.status_code == 200
    assert response.json() == {'authenticated': False, 'role': 'guest'}
