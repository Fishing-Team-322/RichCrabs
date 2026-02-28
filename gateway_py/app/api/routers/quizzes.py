import grpc
from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from app.api.common import err
from app.api.dependencies.auth import require_user
from app.api.dependencies.csrf import require_csrf
from app.grpc_clients.core import clients, map_grpc_err
from app.mappers.quiz_mapper import quiz_to_json
from app.proto_gen import common_pb2, quiz_pb2
from app.schemas import CreateQuizRequest, StartAiQuizRequest, UpdateQuizRequest
from app.services.quiz_service import get_quiz as service_get_quiz, list_quizzes as service_list_quizzes

router = APIRouter(tags=['quizzes'])

@router.get('/api/v1/quizzes')
def list_quizzes(limit: int = 20, pageToken: str = '', ownerUserId: str = ''):
    return service_list_quizzes(limit, pageToken, ownerUserId)

@router.post('/api/v1/quizzes')
def create_quiz(req: Request, body: CreateQuizRequest):
    if (e := require_csrf(req)): return e
    uid = require_user(req)
    if not uid: return err(401, 'unauthorized', 'session cookie is missing or invalid')
    q = quiz_pb2.CreateQuizRequest(owner_user_id=common_pb2.UserId(value=body.ownerUserId or uid), title=body.title, description=body.description)
    for row in body.questions:
        qq = q.questions.add(); qq.id = row.id or ''; qq.text = row.text; qq.options.extend(row.options)
        if row.correctIndex is not None: qq.correct_option_index = row.correctIndex
    try:
        x = clients.quiz.CreateQuiz(q)
    except grpc.RpcError as ex:
        c, b = map_grpc_err(ex, 'create_quiz'); return JSONResponse(b, status_code=c)
    return {'quiz': {'quizId': x.quiz.quiz_id.value, 'ownerUserId': x.quiz.owner_user_id.value, 'title': x.quiz.title, 'description': x.quiz.description}, 'status': 'created'}

@router.get('/api/v1/quizzes/{quizId}')
def get_quiz(quizId: str):
    try:
        q = service_get_quiz(quizId)
    except grpc.RpcError as ex:
        c, b = map_grpc_err(ex, 'get_quiz'); return JSONResponse(b, status_code=c)
    return {'quiz': quiz_to_json(q)}

@router.patch('/api/v1/quizzes/{quizId}')
def upd_quiz(quizId: str, req: Request, body: UpdateQuizRequest):
    if (e := require_csrf(req)): return e
    cur = service_get_quiz(quizId)
    if body.title is not None: cur.title = body.title
    if body.description is not None: cur.description = body.description
    if body.questions is not None:
        del cur.questions[:]
        for row in body.questions:
            qq = cur.questions.add() if hasattr(cur.questions, 'add') else type('QuizQuestion', (), {})()
            if not hasattr(cur.questions, 'add'):
                qq.options = []; cur.questions.append(qq)
            qq.id = row.id or ''; qq.text = row.text; qq.options.extend(row.options)
            if row.correctIndex is not None: qq.correct_option_index = row.correctIndex
    try:
        x = clients.quiz.UpdateQuiz(quiz_pb2.UpdateQuizRequest(quiz=cur))
    except grpc.RpcError as ex:
        c, b = map_grpc_err(ex, 'update_quiz'); return JSONResponse(b, status_code=c)
    return {'quiz': quiz_to_json(x.quiz), 'status': 'updated'}

@router.post('/api/v1/quizzes/{quizId}/publish')
def pub_quiz(quizId: str, req: Request):
    if (e := require_csrf(req)): return e
    uid = require_user(req)
    if not uid: return err(401,'unauthorized','session cookie is missing or invalid')
    x = clients.quiz.PublishQuiz(quiz_pb2.PublishQuizRequest(quiz_id=common_pb2.QuizId(value=quizId), requested_by=common_pb2.UserId(value=uid)))
    return {'quiz': {'quizId': x.quiz.quiz_id.value}, 'publishedVersion': x.published_version, 'status': 'published'}

@router.post('/api/v1/quizzes/ai-generate')
def ai_start(req: Request, body: StartAiQuizRequest):
    if (e := require_csrf(req)): return e
    uid = require_user(req)
    if not uid: return err(401,'unauthorized','session cookie is missing or invalid')
    x = clients.quiz.StartAiQuizJob(quiz_pb2.StartAiQuizJobRequest(requested_by=common_pb2.UserId(value=uid), prompt=body.prompt, desired_question_count=body.desiredQuestionCount))
    return {'jobId': x.job_id, 'status': x.status.lower()}

@router.get('/api/v1/quizzes/ai-jobs/{jobId}')
def ai_get(jobId: str, req: Request):
    uid = require_user(req)
    if not uid: return err(401,'unauthorized','session cookie is missing or invalid')
    x = clients.quiz.GetAiQuizJob(quiz_pb2.GetAiQuizJobRequest(job_id=jobId, requested_by=common_pb2.UserId(value=uid)))
    out = {'jobId': x.job_id, 'status': x.status.lower()}
    if x.HasField('quiz'):
        out['quiz'] = quiz_to_json(x.quiz); out['draftId'] = x.quiz.quiz_id.value
    return out

@router.get('/api/v1/quizzes/ai-jobs/{jobId}/result')
def ai_result(jobId: str, req: Request):
    x = ai_get(jobId, req)
    if x['status'] != 'done':
        return err(409, 'not_implemented', 'ai job is not done', {'error': 'job_not_done', 'status': x['status']})
    return x
