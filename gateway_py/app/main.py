from __future__ import annotations
import asyncio
import json
import os
import re
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

import grpc
import redis
from google.protobuf.json_format import MessageToDict
from fastapi import FastAPI, Request, Response, WebSocket, WebSocketDisconnect
from fastapi.responses import JSONResponse, PlainTextResponse

from app.config import settings
from app.grpc_clients.core import clients, map_grpc_err
from app.security import SessionClaims, issue_csrf_token, issue_session_token, verify_session_token
from app.proto_gen import auth_pb2, bot_pb2, common_pb2, entitlements_pb2, game_pb2, join_pb2, quiz_pb2, richcrab_pb2

rdb = redis.from_url(settings.redis_url, decode_responses=True)
app = FastAPI(
    title="QuizBattle Gateway API",
    docs_url="/docs",
    openapi_url="/openapi.json",
    openapi_tags=[
        {"name": "system", "description": "Gateway service and health endpoints"},
        {"name": "auth", "description": "Authentication and session management"},
        {"name": "profile", "description": "Host profile and account endpoints"},
        {"name": "games", "description": "Game runtime lifecycle endpoints"},
        {"name": "quizzes", "description": "Quiz management endpoints"},
        {"name": "bots", "description": "Bot endpoints"},
        {"name": "admin", "description": "Admin dashboard endpoints"},
        {"name": "ws", "description": "WebSocket endpoint"},
    ],
)


def _room_event_to_dict(ev: Any) -> dict[str, Any]:
    try:
        return MessageToDict(ev, preserving_proto_field_name=True)
    except Exception:
        raw = str(ev).replace("\n", " ")
        try:
            return json.loads(raw)
        except Exception:
            return {"raw": raw}


def err(code: int, error: str, message: str, details: Any = None):
    body: dict[str, Any] = {"error": error, "message": message}
    if details is not None:
        body["details"] = details
    return JSONResponse(body, status_code=code)


def session_from_req(req: Request) -> Optional[SessionClaims]:
    t = req.cookies.get(settings.session_cookie_name)
    return verify_session_token(t) if t else None


def require_csrf(req: Request):
    c = req.cookies.get(settings.csrf_cookie_name)
    h = req.headers.get(settings.csrf_header_name)
    if not c or not h or c != h:
        return err(403, "csrf_required", "csrf token mismatch")
    return None


def set_auth(resp: Response, claims: SessionClaims, csrf_token: Optional[str] = None):
    tok = issue_session_token(claims, settings.session_ttl_seconds)
    csrf = csrf_token or issue_csrf_token()
    resp.set_cookie(settings.session_cookie_name, tok, path=settings.session_cookie_path, secure=settings.session_cookie_secure, httponly=settings.session_cookie_httponly, samesite="lax")
    resp.set_cookie(settings.csrf_cookie_name, csrf, path=settings.csrf_cookie_path, secure=settings.csrf_cookie_secure, httponly=settings.csrf_cookie_httponly, samesite="lax")
    return csrf


@app.get("/health", tags=["system"])
@app.get("/api/v1/healthz", tags=["system"])
def health(grpc_check: bool = False):
    body = {"status": "ok", "gateway": "ok", "requestId": uuid.uuid4().hex}
    if grpc_check:
        try:
            clients.health.Ping(richcrab_pb2.PingRequest())
            body["dependencies"] = {"rust_grpc": "ok"}
        except grpc.RpcError:
            body["status"] = "degraded"
            body["dependencies"] = {"rust_grpc": "down"}
            return JSONResponse(body, status_code=503)
    return body


@app.get("/openapi.yaml", tags=["system"])
def old_openapi():
    p = settings.openapi_path
    if not os.path.exists(p):
        return err(404, "not_found", "openapi schema file is missing")
    return PlainTextResponse(open(p).read())


@app.get("/csrf", tags=["auth"])
@app.get("/api/v1/auth/csrf", tags=["auth"])
def csrf():
    token = issue_csrf_token()
    r = JSONResponse({"token": token})
    r.set_cookie(settings.csrf_cookie_name, token, path=settings.csrf_cookie_path, secure=settings.csrf_cookie_secure, httponly=settings.csrf_cookie_httponly, samesite="lax")
    return r


@app.post("/logout", tags=["auth"])
@app.post("/api/v1/auth/logout", tags=["auth"])
def logout(req: Request):
    if (e := require_csrf(req)):
        return e
    r = Response(status_code=204)
    r.delete_cookie(settings.session_cookie_name, path=settings.session_cookie_path)
    r.delete_cookie(settings.csrf_cookie_name, path=settings.csrf_cookie_path)
    return r


@app.get("/api/v1/session", tags=["auth"])
def session(req: Request):
    s = session_from_req(req)
    if not s:
        return {"authenticated": False, "role": "guest"}
    return {"authenticated": True, "role": s.role, "roomId": s.room_id, "pin": s.pin, "playerId": s.player_id, "userId": s.user_id, "exp": s.exp}


@app.post("/api/v1/auth/register", tags=["auth"])
def register(req: Request, body: dict[str, Any]):
    if (e := require_csrf(req)):
        return e
    try:
        res = clients.auth.Register(auth_pb2.RegisterRequest(email=body["email"], password=body["password"], display_name=body["displayName"]))
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


@app.post("/api/v1/auth/login", tags=["auth"])
def login(req: Request, body: dict[str, Any]):
    if (e := require_csrf(req)):
        return e
    try:
        res = clients.auth.Login(auth_pb2.LoginRequest(email=body["email"], password=body["password"]))
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


def require_user(req: Request) -> Optional[str]:
    s = session_from_req(req)
    if not s or s.role != "host" or not s.user_id:
        return None
    return s.user_id


def _quiz_to_json(q: Any) -> dict[str, Any]:
    questions = []
    for qq in getattr(q, "questions", []):
        row = {"id": qq.id, "text": qq.text, "options": list(qq.options)}
        has_field = getattr(qq, "HasField", None)
        if callable(has_field):
            if qq.HasField("correct_option_index"):
                row["correctIndex"] = qq.correct_option_index
        elif hasattr(qq, "correct_option_index"):
            row["correctIndex"] = qq.correct_option_index
        questions.append(row)
    return {
        "quizId": q.quiz_id.value,
        "ownerUserId": q.owner_user_id.value,
        "title": q.title,
        "description": q.description,
        "questions": questions,
    }


@app.get("/api/v1/me", tags=["profile"])
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


@app.patch("/api/v1/me", tags=["profile"])
def patch_me(req: Request, body: dict[str, Any]):
    if (e := require_csrf(req)):
        return e
    uid = require_user(req)
    if not uid:
        return err(401, "unauthorized", "session cookie is missing or invalid")
    q = auth_pb2.UpdateProfileRequest(user_id=common_pb2.UserId(value=uid))
    if "displayName" in body:
        q.display_name = body["displayName"]
    if "avatarUrl" in body:
        q.avatar_url = body["avatarUrl"]
    try:
        res = clients.auth.UpdateProfile(q)
    except grpc.RpcError as ex:
        c, b = map_grpc_err(ex, "auth_update_profile")
        return JSONResponse(b, status_code=c)
    u = res.user
    return {"id": u.id, "email": u.email, "displayName": u.display_name, "avatarUrl": u.avatar_url}


@app.post("/api/v1/me/password", tags=["profile"])
def password(req: Request, body: dict[str, Any]):
    if (e := require_csrf(req)):
        return e
    uid = require_user(req)
    if not uid:
        return err(401, "unauthorized", "session cookie is missing or invalid")
    try:
        res = clients.auth.ChangePassword(auth_pb2.ChangePasswordRequest(user_id=common_pb2.UserId(value=uid), current_password=body["currentPassword"], new_password=body["newPassword"]))
    except grpc.RpcError as ex:
        c, b = map_grpc_err(ex, "auth_change_password")
        return JSONResponse(b, status_code=c)
    if res.mismatch:
        return err(401, "unauthorized", "current password mismatch")
    return Response(status_code=204)


@app.get("/api/v1/me/sessions", tags=["profile"])
def me_sessions():
    return err(501, "not_implemented", "/api/v1/me/sessions is not implemented")


@app.get("/api/v1/games", tags=["games"])
def list_games(req: Request):
    s = session_from_req(req)
    if not s or not s.room_id or not s.pin:
        return []
    try:
        x = clients.game.GetRoomState(game_pb2.GetRoomStateRequest(room_id=common_pb2.RoomId(value=s.room_id)))
    except grpc.RpcError as ex:
        c, b = map_grpc_err(ex, "list_games")
        return JSONResponse(b, status_code=c)
    players = [{"playerId": p.player_id.value, "name": p.display_name} for p in x.players]
    return [{"pin": s.pin, "state": x.state, "players": players}]

@app.post("/api/v1/games", tags=["games"])
def create_game(req: Request, body: dict[str, Any]):
    if (e := require_csrf(req)): return e
    uid = require_user(req)
    if not uid or body.get("ownerUserId") != uid:
        return err(403, "forbidden", "ownerUserId must match host session")
    try:
        x = clients.game.CreateRoom(game_pb2.CreateRoomRequest(owner_user_id=common_pb2.UserId(value=uid), quiz_id=common_pb2.QuizId(value=body["quizId"]), title=body["title"]))
    except grpc.RpcError as ex:
        c,b = map_grpc_err(ex, "create_room"); return JSONResponse(b,status_code=c)
    claims = SessionClaims(session_type="game", role="host", pin=x.pin, room_id=x.room_id.value, user_id=uid)
    invite_path = x.invite_path or f"/join?inviteToken={x.invite_token}"
    out = JSONResponse({
        "pin": x.pin,
        "inviteToken": x.invite_token,
        "invitePath": invite_path,
        "inviteQrSvg": x.invite_qr_svg,
        "wsUrl": f"{settings.public_base_url}/ws",
    })
    set_auth(out, claims)
    return out


@app.post("/api/v1/games/{pin}/invite/regenerate", tags=["games"])
def regenerate_invite(pin: str, req: Request):
    s = session_from_req(req)
    if not s or s.role != "host" or not s.room_id or not s.user_id:
        return err(401, "unauthorized", "session cookie is missing or invalid")
    if s.pin and s.pin != pin:
        return err(403, "forbidden", "pin must match host session")
    if (e := require_csrf(req)):
        return e
    try:
        x = clients.game.RegenerateInvite(
            game_pb2.RegenerateInviteRequest(
                room_id=common_pb2.RoomId(value=s.room_id),
                requested_by=common_pb2.UserId(value=s.user_id),
            )
        )
    except grpc.RpcError as ex:
        c, b = map_grpc_err(ex, "regenerate_invite")
        return JSONResponse(b, status_code=c)
    return {
        "inviteToken": x.invite_token,
        "invitePath": x.invite_path,
        "inviteQrSvg": x.invite_qr_svg,
    }


def _join_response(pin: str, room_id: str, player_id: str):
    claims = SessionClaims(session_type="game", role="player", pin=pin, room_id=room_id, player_id=player_id)
    out = JSONResponse({"playerId": player_id, "joinTicket": issue_session_token(claims, settings.session_ttl_seconds), "expiresInSec": settings.session_ttl_seconds, "roomPin": pin, "team": "A", "role": "player", "wsUrl": f"{settings.public_base_url}/ws"})
    set_auth(out, claims)
    return out


@app.post("/api/v1/games/{pin}/join", tags=["games"])
def join_pin(pin: str, req: Request, body: dict[str, Any]):
    if (e := require_csrf(req)): return e
    t = clients.join.IssueJoinTicketByPin(join_pb2.IssueJoinTicketByPinRequest(pin=pin, display_name=body.get("name") or body.get("displayName")))
    j = clients.game.JoinRoom(game_pb2.JoinRoomRequest(join_ticket=t.ticket.token))
    return _join_response(pin, t.ticket.room_id.value, j.player_id.value)


@app.post("/api/v1/invites/{inviteToken}/join", tags=["games"])
def join_inv(inviteToken: str, req: Request, body: dict[str, Any]):
    if (e := require_csrf(req)): return e
    t = clients.join.IssueJoinTicketByInvite(join_pb2.IssueJoinTicketByInviteRequest(invite_token=inviteToken, display_name=body.get("name") or body.get("displayName")))
    j = clients.game.JoinRoom(game_pb2.JoinRoomRequest(join_ticket=t.ticket.token))
    return _join_response("", t.ticket.room_id.value, j.player_id.value)


@app.get("/api/v1/games/{pin}", tags=["games"])
@app.get("/api/v1/games/{pin}/state", tags=["games"])
def state(pin: str, req: Request):
    s = session_from_req(req)
    if not s: return err(401, "unauthorized", "session cookie is missing or invalid")
    st = clients.game.GetRoomState(game_pb2.GetRoomStateRequest(room_id=common_pb2.RoomId(value=s.room_id)))
    return {"pin": pin, "state": st.state, "players": [{"playerId": p.player_id.value, "name": p.display_name, "score": p.score} for p in st.players]}


def _host_action(req: Request, pin: str, action: str):
    s = session_from_req(req)
    if not s or s.role != "host": return err(401, "unauthorized", "session cookie is missing or invalid")
    if (e := require_csrf(req)): return e
    fn = {
        "start": clients.game.StartGame,
        "pause": clients.game.PauseGame,
        "resume": clients.game.ResumeGame,
        "next": clients.game.NextQuestion,
    }[action]
    rq = game_pb2.StartGameRequest if action == "start" else game_pb2.PauseGameRequest
    if action == "resume": rq = game_pb2.ResumeGameRequest
    if action == "next": rq = game_pb2.NextQuestionRequest
    fn(rq(room_id=common_pb2.RoomId(value=s.room_id), requested_by=common_pb2.UserId(value=s.user_id)))
    return Response(status_code=204)


@app.post("/api/v1/games/{pin}/start", tags=["games"])
def start(pin: str, req: Request): return _host_action(req, pin, "start")
@app.post("/api/v1/games/{pin}/pause", tags=["games"])
def pause(pin: str, req: Request): return _host_action(req, pin, "pause")
@app.post("/api/v1/games/{pin}/resume", tags=["games"])
def resume(pin: str, req: Request): return _host_action(req, pin, "resume")
@app.post("/api/v1/games/{pin}/next", tags=["games"])
def nextq(pin: str, req: Request): return _host_action(req, pin, "next")


@app.post("/api/v1/games/{pin}/leave", tags=["games"])
def leave(pin: str, req: Request):
    s = session_from_req(req)
    if not s or s.role != "player": return err(403, "forbidden", "only player can leave game")
    if (e := require_csrf(req)): return e
    clients.game.LeaveRoom(game_pb2.LeaveRoomRequest(room_id=common_pb2.RoomId(value=s.room_id), player_id=common_pb2.PlayerId(value=s.player_id)))
    r = Response(status_code=204)
    r.delete_cookie(settings.session_cookie_name, path=settings.session_cookie_path)
    r.delete_cookie(settings.csrf_cookie_name, path=settings.csrf_cookie_path)
    return r


@app.post("/api/v1/games/{pin}/kick", tags=["games"])
def kick(pin: str, req: Request, body: dict[str, Any]):
    s = session_from_req(req)
    if not s or s.role != "host": return err(401, "unauthorized", "session cookie is missing or invalid")
    if (e := require_csrf(req)): return e
    clients.game.KickPlayer(game_pb2.KickPlayerRequest(room_id=common_pb2.RoomId(value=s.room_id), requested_by=common_pb2.UserId(value=s.user_id), player_id=common_pb2.PlayerId(value=body["playerId"])))
    return Response(status_code=204)

@app.post("/api/v1/bots", tags=["bots"])
def reg_bot(req: Request, body: dict[str, Any]):
    if (e := require_csrf(req)): return e
    uid = require_user(req)
    if not uid: return err(401,"unauthorized","session cookie is missing or invalid")
    try:
        b = clients.bot.RegisterBot(
            bot_pb2.RegisterBotRequest(name=body["name"], version=body["version"], endpoint=body["endpoint"]),
            metadata=(("x-user-id", uid),),
        )
    except grpc.RpcError as ex:
        c, b = map_grpc_err(ex, "bot_register")
        return JSONResponse(b, status_code=c)
    return {"bot": {"botId": b.bot.bot_id.value, "name": b.bot.name, "version": b.bot.version, "status": b.bot.status}}

@app.get("/api/v1/bots", tags=["bots"])
def list_bots(req: Request):
    uid = require_user(req)
    if not uid: return err(401,"unauthorized","session cookie is missing or invalid")
    try:
        x = clients.bot.ListBots(bot_pb2.ListBotsRequest(), metadata=(("x-user-id", uid),))
    except grpc.RpcError as ex:
        c, b = map_grpc_err(ex, "bot_list")
        return JSONResponse(b, status_code=c)
    return {"bots": [{"botId": b.bot_id.value, "name": b.name, "version": b.version, "status": b.status} for b in x.bots]}

@app.get("/api/v1/bots/{botId}", tags=["bots"])
def get_bot(botId: str, req: Request):
    uid = require_user(req)
    if not uid: return err(401,"unauthorized","session cookie is missing or invalid")
    try:
        b = clients.bot.GetBotStatus(
            bot_pb2.GetBotStatusRequest(bot_id=common_pb2.BotId(value=botId)),
            metadata=(("x-user-id", uid),),
        ).bot
    except grpc.RpcError as ex:
        c, b = map_grpc_err(ex, "bot_get")
        return JSONResponse(b, status_code=c)
    return {"bot": {"botId": b.bot_id.value, "name": b.name, "version": b.version, "status": b.status}}

@app.patch("/api/v1/bots/{botId}", tags=["bots"])
def patch_bot(botId: str, req: Request, body: dict[str, Any]):
    if (e := require_csrf(req)): return e
    uid = require_user(req)
    if not uid: return err(401,"unauthorized","session cookie is missing or invalid")
    q = bot_pb2.UpdateBotStatusRequest(bot_id=common_pb2.BotId(value=botId))
    if "enabled" in body: q.enabled = body["enabled"]
    if "reason" in body: q.reason = body["reason"]
    try:
        b = clients.bot.UpdateBotStatus(q, metadata=(("x-user-id", uid),)).bot
    except grpc.RpcError as ex:
        c, b = map_grpc_err(ex, "bot_patch")
        return JSONResponse(b, status_code=c)
    return {"bot": {"botId": b.bot_id.value, "name": b.name, "version": b.version, "status": b.status}}

@app.delete("/api/v1/bots/{botId}", tags=["bots"])
def del_bot(botId: str, req: Request):
    if (e := require_csrf(req)): return e
    uid = require_user(req)
    if not uid: return err(401,"unauthorized","session cookie is missing or invalid")
    try:
        clients.bot.RemoveBot(bot_pb2.RemoveBotRequest(bot_id=common_pb2.BotId(value=botId)), metadata=(("x-user-id", uid),))
    except grpc.RpcError as ex:
        c, b = map_grpc_err(ex, "bot_delete")
        return JSONResponse(b, status_code=c)
    return Response(status_code=204)

def _binding_key(bot_id: str) -> str:
    return f"tg:binding:{bot_id}"


def _bot_metadata(uid: str):
    return (("x-user-id", uid),)


@app.post("/api/v1/telegram/bots/connect", tags=["bots"])
def tg_connect(req: Request, body: dict[str,Any]):
    if (e := require_csrf(req)): return e
    uid = require_user(req)
    if not uid: return err(401,"unauthorized","session cookie is missing or invalid")
    token = str(body.get("token", "")).strip()
    if not token:
        return err(400, "validation_error", "telegram token is required")
    if ":" not in token or not token.split(":", 1)[0].isdigit():
        return err(422, "validation_error", "telegram token format is invalid")
    try:
        b = clients.bot.RegisterBot(
            bot_pb2.RegisterBotRequest(name="Telegram", version="telegram", endpoint=f"telegram://{token.split(':', 1)[0]}"),
            metadata=_bot_metadata(uid),
        ).bot
    except grpc.RpcError as ex:
        c, bb = map_grpc_err(ex, "tg_connect")
        return JSONResponse(bb, status_code=c)
    secret = uuid.uuid4().hex[:24]
    rdb.set(_binding_key(b.bot_id.value), json.dumps({"userId": uid, "secret": secret, "token": token}))
    return {
        "botId": b.bot_id.value,
        "webhookUrl": f"{settings.public_base_url}/api/v1/telegram/webhook/{b.bot_id.value}/{secret}",
        "status": "connected",
    }


@app.get("/api/v1/telegram/bots/status", tags=["bots"])
def tg_status(req: Request):
    uid = require_user(req)
    if not uid: return err(401,"unauthorized","session cookie is missing or invalid")
    try:
        bots = clients.bot.ListBots(bot_pb2.ListBotsRequest(), metadata=_bot_metadata(uid)).bots
    except grpc.RpcError as ex:
        c, bb = map_grpc_err(ex, "tg_status")
        return JSONResponse(bb, status_code=c)
    for b in bots:
        if rdb.get(_binding_key(b.bot_id.value)):
            return {"active": True, "botId": b.bot_id.value}
    return {"active": False, "botId": ""}


@app.delete("/api/v1/telegram/bots/{botId}", tags=["bots"])
def tg_unbind(botId: str, req: Request):
    if (e := require_csrf(req)): return e
    uid = require_user(req)
    if not uid: return err(401,"unauthorized","session cookie is missing or invalid")
    try:
        clients.bot.RemoveBot(bot_pb2.RemoveBotRequest(bot_id=common_pb2.BotId(value=botId)), metadata=_bot_metadata(uid))
    except grpc.RpcError as ex:
        c, bb = map_grpc_err(ex, "tg_unbind")
        return JSONResponse(bb, status_code=c)
    rdb.delete(_binding_key(botId))
    return Response(status_code=204)


@app.post("/api/v1/telegram/webhook/{botId}/{secret}", tags=["bots"])
def tg_webhook(botId: str, secret: str, req: Request):
    row = rdb.get(_binding_key(botId))
    if not row:
        return {"status": "ignored", "botId": botId}
    try:
        parsed = json.loads(row)
    except Exception:
        return {"status": "ignored", "botId": botId}
    header_secret = req.headers.get("x-telegram-bot-api-secret-token", "")
    if not header_secret or header_secret != secret:
        return {"status": "ignored", "botId": botId}
    return {"status": "processed", "botId": botId}

@app.get("/api/v1/quizzes", tags=["quizzes"])
def list_quizzes(limit: int = 20, pageToken: str = "", ownerUserId: str = ""):
    req = quiz_pb2.ListQuizzesRequest(page_size=limit, page_token=pageToken)
    if ownerUserId: req.owner_user_id.value = ownerUserId
    x = clients.quiz.ListQuizzes(req)
    return {"limit": limit, "nextPageToken": x.next_page_token, "items": [_quiz_to_json(q) for q in x.quizzes]}

@app.post("/api/v1/quizzes", tags=["quizzes"])
def create_quiz(req: Request, body: dict[str, Any]):
    if (e := require_csrf(req)): return e
    uid = require_user(req)
    if not uid: return err(401, "unauthorized", "session cookie is missing or invalid")
    q = quiz_pb2.CreateQuizRequest(owner_user_id=common_pb2.UserId(value=body.get("ownerUserId", uid)), title=body["title"], description=body.get("description", ""))
    for row in body.get("questions", []):
        qq = q.questions.add(); qq.id = row.get("id", ""); qq.text = row["text"]; qq.options.extend(row["options"])
        if "correctIndex" in row: qq.correct_option_index = row["correctIndex"]
    try:
        x = clients.quiz.CreateQuiz(q)
    except grpc.RpcError as ex:
        c, b = map_grpc_err(ex, "create_quiz")
        return JSONResponse(b, status_code=c)
    return {"quiz": {"quizId": x.quiz.quiz_id.value, "ownerUserId": x.quiz.owner_user_id.value, "title": x.quiz.title, "description": x.quiz.description}, "status": "created"}

@app.get("/api/v1/quizzes/{quizId}", tags=["quizzes"])
def get_quiz(quizId: str):
    try:
        q = clients.quiz.GetQuiz(quiz_pb2.GetQuizRequest(quiz_id=common_pb2.QuizId(value=quizId))).quiz
    except grpc.RpcError as ex:
        c, b = map_grpc_err(ex, "get_quiz")
        return JSONResponse(b, status_code=c)
    return {"quiz": _quiz_to_json(q)}

@app.patch("/api/v1/quizzes/{quizId}", tags=["quizzes"])
def upd_quiz(quizId: str, req: Request, body: dict[str,Any]):
    if (e := require_csrf(req)): return e
    try:
        cur = clients.quiz.GetQuiz(quiz_pb2.GetQuizRequest(quiz_id=common_pb2.QuizId(value=quizId))).quiz
    except grpc.RpcError as ex:
        c, b = map_grpc_err(ex, "get_quiz")
        return JSONResponse(b, status_code=c)
    if "title" in body: cur.title = body["title"]
    if "description" in body: cur.description = body["description"]
    if "questions" in body:
        del cur.questions[:]
        for row in body["questions"]:
            if hasattr(cur.questions, "add"):
                qq = cur.questions.add()
            else:
                qq = type("QuizQuestion", (), {})()
                qq.options = []
                cur.questions.append(qq)
            qq.id = row.get("id", "")
            qq.text = row["text"]
            qq.options.extend(row["options"])
            if "correctIndex" in row and row["correctIndex"] is not None:
                qq.correct_option_index = row["correctIndex"]
    try:
        x = clients.quiz.UpdateQuiz(quiz_pb2.UpdateQuizRequest(quiz=cur))
    except grpc.RpcError as ex:
        c, b = map_grpc_err(ex, "update_quiz")
        return JSONResponse(b, status_code=c)
    return {"quiz": _quiz_to_json(x.quiz), "status": "updated"}

@app.post("/api/v1/quizzes/{quizId}/publish", tags=["quizzes"])
def pub_quiz(quizId: str, req: Request):
    if (e := require_csrf(req)): return e
    uid = require_user(req)
    if not uid: return err(401,"unauthorized","session cookie is missing or invalid")
    try:
        x = clients.quiz.PublishQuiz(quiz_pb2.PublishQuizRequest(quiz_id=common_pb2.QuizId(value=quizId), requested_by=common_pb2.UserId(value=uid)))
    except grpc.RpcError as ex:
        c, b = map_grpc_err(ex, "publish_quiz")
        return JSONResponse(b, status_code=c)
    return {"quiz": {"quizId": x.quiz.quiz_id.value}, "publishedVersion": x.published_version, "status": "published"}

@app.post("/api/v1/quizzes/ai-generate", tags=["quizzes"])
def ai_start(req: Request, body: dict[str,Any]):
    if (e := require_csrf(req)): return e
    uid = require_user(req)
    if not uid: return err(401,"unauthorized","session cookie is missing or invalid")
    try:
        x = clients.quiz.StartAiQuizJob(quiz_pb2.StartAiQuizJobRequest(requested_by=common_pb2.UserId(value=uid), prompt=body["prompt"], desired_question_count=body.get("desiredQuestionCount",0)))
    except grpc.RpcError as ex:
        c, b = map_grpc_err(ex, "start_ai_quiz")
        return JSONResponse(b, status_code=c)
    return {"jobId": x.job_id, "status": x.status.lower()}

@app.get("/api/v1/quizzes/ai-jobs/{jobId}", tags=["quizzes"])
def ai_get(jobId: str, req: Request):
    uid = require_user(req)
    if not uid: return err(401,"unauthorized","session cookie is missing or invalid")
    try:
        x = clients.quiz.GetAiQuizJob(quiz_pb2.GetAiQuizJobRequest(job_id=jobId, requested_by=common_pb2.UserId(value=uid)))
    except grpc.RpcError as ex:
        c, b = map_grpc_err(ex, "get_ai_quiz")
        return JSONResponse(b, status_code=c)
    out = {"jobId": x.job_id, "status": x.status.lower()}
    if x.HasField("quiz"):
        out["quiz"] = _quiz_to_json(x.quiz)
        out["draftId"] = x.quiz.quiz_id.value
    return out

@app.get("/api/v1/quizzes/ai-jobs/{jobId}/result", tags=["quizzes"])
def ai_result(jobId: str, req: Request):
    x = ai_get(jobId, req)
    if x["status"] != "done":
        return err(409, "not_implemented", "ai job is not done", {"error":"job_not_done","status": x["status"]})
    return x

@app.get("/api/v1/entitlements", tags=["profile"])
def ents(req: Request):
    uid = require_user(req)
    if not uid: return err(401,"unauthorized","session cookie is missing or invalid")
    usage = usage_impl(uid)
    return {"limits": [{"limit": "rooms", "used": usage["usage"]["rooms"], "max": 10}, {"limit": "bots", "used": usage["usage"]["bots"], "max": 20}, {"limit": "ai", "used": usage["usage"]["ai"], "max": 30}], "byLimit": {"rooms": {"limit": "rooms", "used": usage["usage"]["rooms"], "max": 10}, "bots": {"limit": "bots", "used": usage["usage"]["bots"], "max": 20}, "ai": {"limit": "ai", "used": usage["usage"]["ai"], "max": 30}}}




BILLING_PLANS = [
    {
        "id": "free",
        "code": "free",
        "title": "Free",
        "description": "Базовый план",
        "price": 0,
        "currency": "USD",
        "interval": "month",
        "limits": [
            {"key": "rooms", "title": "rooms", "value": 10},
            {"key": "bots", "title": "bots", "value": 20},
            {"key": "ai", "title": "ai", "value": 30},
        ],
    }
]


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _default_subscription():
    now = datetime.now(timezone.utc)
    return {
        "id": "sub_free",
        "planCode": "free",
        "status": "active",
        "currentPeriodStart": now.isoformat(),
        "currentPeriodEnd": (now + timedelta(days=30)).isoformat(),
        "cancelAtPeriodEnd": False,
    }


def _billing_sub_key(uid: str) -> str:
    return f"billing:sub:{uid}"


def _billing_history_key(uid: str) -> str:
    return f"billing:history:{uid}"


def _billing_promo_key(uid: str) -> str:
    return f"billing:promo:{uid}"


def _load_subscription(uid: str) -> dict[str, Any]:
    raw = rdb.get(_billing_sub_key(uid))
    if not raw:
        return _default_subscription()
    try:
        return json.loads(raw)
    except Exception:
        return _default_subscription()


def _save_subscription(uid: str, sub: dict[str, Any]):
    rdb.set(_billing_sub_key(uid), json.dumps(sub))


def _append_billing_tx(uid: str, tx: dict[str, Any]):
    rdb.lpush(_billing_history_key(uid), json.dumps(tx))
    rdb.ltrim(_billing_history_key(uid), 0, 99)

def usage_impl(uid: str):
    return {"usage": {"rooms": int(rdb.get(f"usage:{uid}:rooms") or 0), "bots": int(rdb.get(f"usage:{uid}:bots") or 0), "ai": int(rdb.get(f"usage:{uid}:ai") or 0)}}

@app.get("/api/v1/usage", tags=["profile"])
def usage(req: Request):
    uid = require_user(req)
    if not uid: return err(401,"unauthorized","session cookie is missing or invalid")
    return usage_impl(uid)



@app.get("/api/v1/billing/plans", tags=["profile"])
def billing_plans(req: Request):
    if not require_user(req): return err(401,"unauthorized","session cookie is missing or invalid")
    return {"plans": BILLING_PLANS}


@app.get("/api/v1/billing/current", tags=["profile"])
def billing_current(req: Request):
    uid = require_user(req)
    if not uid: return err(401,"unauthorized","session cookie is missing or invalid")
    return {"subscription": _load_subscription(uid)}


@app.get("/api/v1/billing/history", tags=["profile"])
def billing_history(req: Request):
    uid = require_user(req)
    if not uid: return err(401,"unauthorized","session cookie is missing or invalid")
    rows = rdb.lrange(_billing_history_key(uid), 0, 99)
    txs: list[dict[str, Any]] = []
    for row in rows:
        try:
            txs.append(json.loads(row))
        except Exception:
            continue
    return {"transactions": txs}


@app.post("/api/v1/billing/checkout", tags=["profile"])
def billing_checkout(req: Request, body: dict[str, Any]):
    if (e := require_csrf(req)): return e
    uid = require_user(req)
    if not uid: return err(401,"unauthorized","session cookie is missing or invalid")
    plan_code = body.get("planCode", "free")
    plan = next((p for p in BILLING_PLANS if p["code"] == plan_code), None)
    if not plan: return err(400, "validation_error", "unknown billing plan")
    now = datetime.now(timezone.utc)
    sub = {
        "id": f"sub_{uid}",
        "planCode": plan_code,
        "status": "active",
        "currentPeriodStart": now.isoformat(),
        "currentPeriodEnd": (now + timedelta(days=30)).isoformat(),
        "cancelAtPeriodEnd": False,
        "renewedAt": now.isoformat(),
    }
    _save_subscription(uid, sub)
    _append_billing_tx(uid, {
        "id": f"tx_{uuid.uuid4().hex[:10]}",
        "status": "paid",
        "amount": plan["price"],
        "currency": plan["currency"],
        "occurredAt": now.isoformat(),
        "description": f"Subscription checkout: {plan_code}",
    })
    return {"checkoutUrl": "", "status": "paid"}


@app.post("/api/v1/billing/cancel", tags=["profile"])
def billing_cancel(req: Request):
    if (e := require_csrf(req)): return e
    uid = require_user(req)
    if not uid: return err(401,"unauthorized","session cookie is missing or invalid")
    sub = _load_subscription(uid)
    sub["status"] = "canceled"
    sub["cancelAtPeriodEnd"] = True
    _save_subscription(uid, sub)
    _append_billing_tx(uid, {
        "id": f"tx_{uuid.uuid4().hex[:10]}",
        "status": "canceled",
        "amount": 0,
        "currency": "USD",
        "occurredAt": _utc_now_iso(),
        "description": "Subscription canceled",
    })
    return Response(status_code=204)


@app.post("/api/v1/billing/promo", tags=["profile"])
def billing_promo(req: Request, body: dict[str, Any]):
    if (e := require_csrf(req)): return e
    uid = require_user(req)
    if not uid: return err(401,"unauthorized","session cookie is missing or invalid")
    code = str(body.get("code", "")).strip()
    if len(code) < 3: return err(400, "validation_error", "promo code is too short")
    rdb.set(_billing_promo_key(uid), code)
    return {"status": "applied", "code": code}


@app.post("/api/v1/billing/callback-status", tags=["profile"])
def billing_callback_status(req: Request, body: dict[str, Any]):
    if (e := require_csrf(req)): return e
    uid = require_user(req)
    if not uid: return err(401,"unauthorized","session cookie is missing or invalid")
    status = body.get("paymentStatus") or "pending"
    _append_billing_tx(uid, {
        "id": body.get("sessionId") or f"tx_{uuid.uuid4().hex[:10]}",
        "status": status,
        "amount": 0,
        "currency": "USD",
        "occurredAt": _utc_now_iso(),
        "description": "Payment callback status",
    })
    return {"status": "accepted"}

@app.get("/admin/api/stats", tags=["admin"])
def stats(req: Request):
    if not require_user(req): return err(403, "forbidden", "admin access required")
    x = clients.auth.GetAdminStats(auth_pb2.GetAdminStatsRequest())
    return {"usersCount": x.users_count, "gamesCount": x.games_count, "activeRooms": x.active_rooms}

@app.post("/admin/api/users/{userId}/ban", tags=["admin"])
def ban(userId: str, req: Request, body: dict[str,Any]):
    if (e := require_csrf(req)): return e
    if not require_user(req): return err(403, "forbidden", "admin access required")
    clients.auth.SetUserBan(auth_pb2.SetUserBanRequest(user_id=common_pb2.UserId(value=userId), banned=True, reason=body.get("reason","")))
    return Response(status_code=204)

@app.post("/admin/api/users/{userId}/unban", tags=["admin"])
def unban(userId: str, req: Request, body: dict[str,Any]):
    if (e := require_csrf(req)): return e
    if not require_user(req): return err(403, "forbidden", "admin access required")
    clients.auth.SetUserBan(auth_pb2.SetUserBanRequest(user_id=common_pb2.UserId(value=userId), banned=False, reason=body.get("reason","")))
    return Response(status_code=204)

@app.post("/admin/api/bots/{botId}/disable", tags=["admin"])
def admin_disable(botId: str, req: Request, body: dict[str,Any]):
    if (e := require_csrf(req)): return e
    if not require_user(req): return err(403, "forbidden", "admin access required")
    clients.bot.UpdateBotStatus(bot_pb2.UpdateBotStatusRequest(bot_id=common_pb2.BotId(value=botId), enabled=False, reason=body.get("reason","")))
    return Response(status_code=204)


@app.websocket("/ws")
async def ws(ws: WebSocket):
    await ws.accept()
    token = ws.cookies.get(settings.session_cookie_name) or ws.query_params.get("joinTicket")
    s = verify_session_token(token) if token else None
    if not s or not s.room_id:
        await ws.close()
        return
    await ws.send_json({"type": "hello", "roomId": s.room_id, "role": s.role})

    def _next_stream_event(stream):
        try:
            return next(stream)
        except StopIteration:
            return None

    async def events_loop():
        req = game_pb2.SubscribeRoomEventsRequest(room_id=common_pb2.RoomId(value=s.room_id))
        if s.player_id:
            req.subscriber_player_id.value = s.player_id
        try:
            stream = iter(clients.game.SubscribeRoomEvents(req))
            while True:
                ev = await asyncio.to_thread(_next_stream_event, stream)
                if ev is None:
                    return
                event_dict = _room_event_to_dict(ev)
                await ws.send_json({"type": "room_event", "event": event_dict})
                chat_event = event_dict.get("chat_message_posted")
                if chat_event:
                    await ws.send_json({
                        "type": "chat_message",
                        "message_id": chat_event.get("message_id", ""),
                        "author": chat_event.get("author", ""),
                        "body": chat_event.get("body", ""),
                        "created_at": chat_event.get("created_at"),
                    })
        except grpc.RpcError as ex:
            try:
                c, b = map_grpc_err(ex, "subscribe_room_events")
            except Exception:
                c, b = 500, {"error": "internal", "message": "room event stream failed"}
            await ws.send_json({"type": "error", "error": b.get("error", "grpc_error"), "message": b.get("message", "room event stream failed"), "details": {"status": c}})

    events_task = asyncio.create_task(events_loop())

    try:
        while True:
            msg = await ws.receive_json()
            t = msg.get("type")
            if t == "ping":
                await ws.send_json({"type": "pong"})
            elif t == "get_state":
                g = clients.game.GetRoomState(game_pb2.GetRoomStateRequest(room_id=common_pb2.RoomId(value=s.room_id)))
                await ws.send_json({"type": "room_state", "room_id": g.room_id.value, "state": g.state, "players": [{"player_id": p.player_id.value, "display_name": p.display_name, "score": p.score} for p in g.players]})
            elif t == "get_chat_history":
                limit = int(msg.get("limit") or 50)
                history = clients.game.GetRoomChatMessages(game_pb2.GetRoomChatMessagesRequest(room_id=common_pb2.RoomId(value=s.room_id), limit=max(1, min(limit, 100))))
                await ws.send_json({
                    "type": "chat_history",
                    "messages": [
                        {
                            "message_id": item.message_id,
                            "author": item.author,
                            "body": item.body,
                            "created_at": MessageToDict(item.created_at, preserving_proto_field_name=True) if item.created_at else None,
                        }
                        for item in history.messages
                    ],
                })
            elif t == "start_game" and s.role == "host":
                x = clients.game.StartGame(game_pb2.StartGameRequest(room_id=common_pb2.RoomId(value=s.room_id), requested_by=common_pb2.UserId(value=s.user_id)))
                await ws.send_json({"type": "start_game_result", "started": x.started})
            elif t == "pause_game" and s.role == "host":
                x = clients.game.PauseGame(game_pb2.PauseGameRequest(room_id=common_pb2.RoomId(value=s.room_id), requested_by=common_pb2.UserId(value=s.user_id)))
                await ws.send_json({"type": "pause_game_result", "paused": x.paused})
            elif t == "resume_game" and s.role == "host":
                x = clients.game.ResumeGame(game_pb2.ResumeGameRequest(room_id=common_pb2.RoomId(value=s.room_id), requested_by=common_pb2.UserId(value=s.user_id)))
                await ws.send_json({"type": "resume_game_result", "resumed": x.resumed})
            elif t == "next_question" and s.role == "host":
                x = clients.game.NextQuestion(game_pb2.NextQuestionRequest(room_id=common_pb2.RoomId(value=s.room_id), requested_by=common_pb2.UserId(value=s.user_id)))
                await ws.send_json({"type": "next_question_result", "advanced": x.advanced})
            elif t == "submit_answer" and s.role == "player":
                x = clients.game.SubmitAnswer(game_pb2.SubmitAnswerRequest(room_id=common_pb2.RoomId(value=s.room_id), player_id=common_pb2.PlayerId(value=s.player_id), question_id=msg.get("question_id",""), answer=msg.get("answer","")))
                await ws.send_json({"type": "submit_answer_result", "accepted": x.accepted, "score_delta": x.score_delta})
            elif t == "chat_send":
                body = str(msg.get("body") or "").strip()
                if not body:
                    await ws.send_json({"type": "error", "error": "invalid_chat_body", "message": "chat body is required"})
                    continue
                chat_req = game_pb2.PostChatMessageRequest(
                    room_id=common_pb2.RoomId(value=s.room_id),
                    body=body,
                )
                if s.role == "player" and s.player_id:
                    chat_req.player_id.value = s.player_id
                elif s.role == "host" and s.user_id:
                    chat_req.user_id.value = s.user_id
                else:
                    await ws.send_json({"type": "error", "error": "unauthorized", "message": "chat author is not available"})
                    continue

                posted = clients.game.PostChatMessage(chat_req)
                if posted.message:
                    await ws.send_json({
                        "type": "chat_sent",
                        "message_id": posted.message.message_id,
                        "author": posted.message.author,
                        "body": posted.message.body,
                        "created_at": MessageToDict(posted.message.created_at, preserving_proto_field_name=True) if posted.message.created_at else None,
                    })
            else:
                await ws.send_json({"type": "error", "error": "unsupported_message_type", "message": "unsupported client message type"})
    except WebSocketDisconnect:
        events_task.cancel()
        return
    finally:
        if not events_task.done():
            events_task.cancel()
        try:
            await events_task
        except (asyncio.CancelledError, WebSocketDisconnect):
            pass
