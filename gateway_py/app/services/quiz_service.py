from app.grpc_clients.core import clients
from app.mappers.quiz_mapper import quiz_to_json
from app.proto_gen import common_pb2, quiz_pb2


def list_quizzes(limit: int, page_token: str, owner_user_id: str):
    req = quiz_pb2.ListQuizzesRequest(page_size=limit, page_token=page_token)
    if owner_user_id:
        req.owner_user_id.value = owner_user_id
    x = clients.quiz.ListQuizzes(req)
    return {"limit": limit, "nextPageToken": x.next_page_token, "items": [quiz_to_json(q) for q in x.quizzes]}


def get_quiz(quiz_id: str):
    return clients.quiz.GetQuiz(quiz_pb2.GetQuizRequest(quiz_id=common_pb2.QuizId(value=quiz_id))).quiz
