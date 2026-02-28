
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


def test_update_quiz_updates_questions_and_correct_index(client, host_session_cookie, csrf_headers, fake_clients):
    class Questions(list):
        def add(self):
            q = type("Q", (), {"id": "", "text": "", "options": [], "correct_option_index": 0})()
            self.append(q)
            return q

    class CurQuiz:
        def __init__(self):
            self.quiz_id = type("Id", (), {"value": "q1"})()
            self.owner_user_id = type("Id", (), {"value": "u1"})()
            self.title = "Old"
            self.description = "Old desc"
            self.questions = Questions()

    current = CurQuiz()

    class Resp:
        def __init__(self, quiz):
            self.quiz = quiz

    fake_clients.quiz.GetQuiz = lambda req: Resp(current)
    fake_clients.quiz.UpdateQuiz = lambda req: Resp(req.quiz)

    cookies = {**host_session_cookie, **csrf_headers["cookies"]}
    response = client.patch(
        "/api/v1/quizzes/q1",
        json={
            "title": "New",
            "questions": [
                {
                    "id": "q-1",
                    "text": "Question",
                    "options": ["A", "B", "C"],
                    "correctIndex": 2,
                }
            ],
        },
        cookies=cookies,
        headers=csrf_headers["headers"],
    )

    assert response.status_code == 200
    payload = response.json()["quiz"]
    assert payload["title"] == "New"
    assert payload["questions"][0]["correctIndex"] == 2


def test_ai_job_returns_draft_id_with_quiz(client, host_session_cookie, csrf_headers, fake_clients):
    class Question:
        id = "q1"
        text = "Q"
        options = ["A", "B"]

        def HasField(self, field):
            return field == "correct_option_index"

        correct_option_index = 1

    class Quiz:
        quiz_id = type("Id", (), {"value": "draft-1"})()
        owner_user_id = type("Id", (), {"value": "u1"})()
        title = "AI"
        description = "desc"
        questions = [Question()]

    class AiResp:
        job_id = "job-3"
        status = "DONE"
        quiz = Quiz()

        def HasField(self, field):
            return field == "quiz"

    fake_clients.quiz.GetAiQuizJob = lambda req: AiResp()

    cookies = {**host_session_cookie, **csrf_headers["cookies"]}
    response = client.get(
        "/api/v1/quizzes/ai-jobs/job-3",
        cookies=cookies,
        headers=csrf_headers["headers"],
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "done"
    assert payload["draftId"] == "draft-1"
    assert payload["quiz"]["questions"][0]["correctIndex"] == 1
