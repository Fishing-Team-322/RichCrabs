
def test_list_quizzes_happy_path(client):
    response = client.get("/api/v1/quizzes")
    assert response.status_code == 200
    assert response.json()["items"] == []


def test_create_quiz_requires_session(client, csrf_headers):
    response = client.post(
        "/api/v1/quizzes",
        json={"title": "Quiz", "questions": []},
        cookies=csrf_headers["cookies"],
        headers=csrf_headers["headers"],
    )
    assert response.status_code == 401


def test_create_quiz_happy_path(client, host_session_cookie, csrf_headers):
    cookies = {**host_session_cookie, **csrf_headers["cookies"]}
    response = client.post(
        "/api/v1/quizzes",
        json={"title": "Quiz", "description": "D", "questions": [{"text": "Q", "options": ["A", "B"]}]},
        cookies=cookies,
        headers=csrf_headers["headers"],
    )
    assert response.status_code == 200
    assert response.json()["quiz"]["quizId"] == "q1"


def test_publish_quiz_requires_host_session(client, player_session_cookie, csrf_headers):
    cookies = {**player_session_cookie, **csrf_headers["cookies"]}
    response = client.post("/api/v1/quizzes/q1/publish", cookies=cookies, headers=csrf_headers["headers"])
    assert response.status_code == 401
