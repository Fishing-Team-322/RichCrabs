
def test_admin_stats_forbidden_without_session(client):
    response = client.get("/admin/api/stats")
    assert response.status_code == 403


def test_admin_stats_happy_path(client, host_session_cookie):
    response = client.get("/admin/api/stats", cookies=host_session_cookie)
    assert response.status_code == 200
    assert response.json()["usersCount"] == 10


def test_admin_ban_requires_csrf(client, host_session_cookie):
    response = client.post("/admin/api/users/u2/ban", json={"reason": "x"}, cookies=host_session_cookie)
    assert response.status_code == 403
