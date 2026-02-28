import grpc
from fastapi import APIRouter, Request, Response
from fastapi.responses import JSONResponse
from app.api.common import err
from app.api.dependencies.auth import require_user
from app.api.dependencies.csrf import require_csrf
from app.grpc_clients.core import clients, map_grpc_err
from app.proto_gen import auth_pb2, common_pb2
from app.schemas import ChangePasswordRequest, PatchMeRequest

router = APIRouter(tags=["profile"])


@router.get("/api/v1/me")
def me(req: Request):
    uid = require_user(req)
    if not uid:
        return err(401, "unauthorized", "session cookie is missing or invalid")
    try:
        res = clients.auth.GetMe(auth_pb2.GetMeRequest(user_id=common_pb2.UserId(value=uid)))
    except grpc.RpcError as ex:
        c, b = map_grpc_err(ex, "auth_get_me")
        return JSONResponse(b, status_code=c)
    if not res.found:
        return err(404, "not_found", "user not found")
    u = res.user
    return {"id": u.id, "email": u.email, "displayName": u.display_name, "avatarUrl": u.avatar_url}


@router.patch("/api/v1/me")
def patch_me(req: Request, body: PatchMeRequest):
    if (e := require_csrf(req)): return e
    uid = require_user(req)
    if not uid:
        return err(401, "unauthorized", "session cookie is missing or invalid")
    q = auth_pb2.UpdateProfileRequest(user_id=common_pb2.UserId(value=uid))
    if body.displayName is not None: q.display_name = body.displayName
    if body.avatarUrl is not None: q.avatar_url = body.avatarUrl
    try:
        res = clients.auth.UpdateProfile(q)
    except grpc.RpcError as ex:
        c, b = map_grpc_err(ex, "auth_update_profile")
        return JSONResponse(b, status_code=c)
    u = res.user
    return {"id": u.id, "email": u.email, "displayName": u.display_name, "avatarUrl": u.avatar_url}


@router.post("/api/v1/me/password")
def password(req: Request, body: ChangePasswordRequest):
    if (e := require_csrf(req)): return e
    uid = require_user(req)
    if not uid:
        return err(401, "unauthorized", "session cookie is missing or invalid")
    try:
        res = clients.auth.ChangePassword(auth_pb2.ChangePasswordRequest(user_id=common_pb2.UserId(value=uid), current_password=body.currentPassword, new_password=body.newPassword))
    except grpc.RpcError as ex:
        c, b = map_grpc_err(ex, "auth_change_password")
        return JSONResponse(b, status_code=c)
    if res.mismatch:
        return err(401, "unauthorized", "current password mismatch")
    return Response(status_code=204)


@router.get("/api/v1/me/sessions")
def me_sessions():
    return err(501, "not_implemented", "/api/v1/me/sessions is not implemented")
