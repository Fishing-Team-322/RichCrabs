from fastapi import APIRouter, Request, Response
from fastapi.responses import JSONResponse
import grpc
from app.api.common import err
from app.api.dependencies.auth import session_from_req
from app.api.dependencies.csrf import require_csrf
from app.config import settings
from app.grpc_clients.core import clients, map_grpc_err
from app.schemas import LoginRequest, RegisterRequest
from app.security import SessionClaims, issue_csrf_token, set_auth
from app.proto_gen import auth_pb2

router = APIRouter(tags=["auth"])


@router.get("/csrf")
@router.get("/api/v1/auth/csrf")
def csrf():
    token = issue_csrf_token()
    r = JSONResponse({"token": token})
    r.set_cookie(settings.csrf_cookie_name, token, path=settings.csrf_cookie_path, secure=settings.csrf_cookie_secure, httponly=settings.csrf_cookie_httponly, samesite="lax")
    return r


@router.post("/logout")
@router.post("/api/v1/auth/logout")
def logout(req: Request):
    if (e := require_csrf(req)):
        return e
    r = Response(status_code=204)
    r.delete_cookie(settings.session_cookie_name, path=settings.session_cookie_path)
    r.delete_cookie(settings.csrf_cookie_name, path=settings.csrf_cookie_path)
    return r


@router.get("/api/v1/session")
def session(req: Request):
    s = session_from_req(req)
    if not s:
        return {"authenticated": False, "role": "guest"}
    return {"authenticated": True, "role": s.role, "roomId": s.room_id, "pin": s.pin, "playerId": s.player_id, "userId": s.user_id, "exp": s.exp}


@router.post("/api/v1/auth/register")
def register(req: Request, body: RegisterRequest):
    if (e := require_csrf(req)): return e
    try:
        res = clients.auth.Register(auth_pb2.RegisterRequest(email=body.email, password=body.password, display_name=body.displayName))
    except grpc.RpcError as ex:
        c, b = map_grpc_err(ex, "auth_register")
        return JSONResponse(b, status_code=c)
    if res.email_taken:
        return err(409, "email_taken", "email already registered")
    u = res.user
    csrf_token = issue_csrf_token()
    out = JSONResponse({"user": {"id": u.id, "email": u.email, "displayName": u.display_name, "avatarUrl": u.avatar_url}, "csrfToken": csrf_token})
    set_auth(out, SessionClaims(session_type="auth", role="host", user_id=u.id), csrf_token=csrf_token)
    return out


@router.post("/api/v1/auth/login")
def login(req: Request, body: LoginRequest):
    if (e := require_csrf(req)): return e
    try:
        res = clients.auth.Login(auth_pb2.LoginRequest(email=body.email, password=body.password))
    except grpc.RpcError as ex:
        c, b = map_grpc_err(ex, "auth_login")
        return JSONResponse(b, status_code=c)
    if not res.authenticated:
        return err(401, "unauthorized", "invalid email or password")
    u = res.user
    csrf_token = issue_csrf_token()
    out = JSONResponse({"user": {"id": u.id, "email": u.email, "displayName": u.display_name, "avatarUrl": u.avatar_url}, "csrfToken": csrf_token})
    set_auth(out, SessionClaims(session_type="auth", role="host", user_id=u.id), csrf_token=csrf_token)
    return out
