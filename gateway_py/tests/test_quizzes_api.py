
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


def test_ai_generate_happy_path(client, host_session_cookie, csrf_headers):
    cookies = {**host_session_cookie, **csrf_headers["cookies"]}
    response = client.post(
        "/api/v1/quizzes/ai-generate",
        json={"prompt": "Rust", "desiredQuestionCount": 3},
        cookies=cookies,
        headers=csrf_headers["headers"],
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["jobId"] == "job-1"
    assert payload["status"] == "done"


def test_ai_job_returns_error_message(client, host_session_cookie, csrf_headers, fake_clients):
    class ErrorObj:
        def __init__(self, message):
            self.message = message

    class AiResp:
        job_id = "job-2"
        status = "FAILED"
        error = ErrorObj("generation failed")

        def HasField(self, field):
            return field == "error"

    fake_clients.quiz.GetAiQuizJob = lambda req: AiResp()

    cookies = {**host_session_cookie, **csrf_headers["cookies"]}
    response = client.get(
        "/api/v1/quizzes/ai-jobs/job-2",
        cookies=cookies,
        headers=csrf_headers["headers"],
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "failed"
    assert payload["error"] == "generation failed"
    assert payload["errorMessage"] == "generation failed"
