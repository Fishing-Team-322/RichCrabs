from __future__ import annotations
import asyncio
import json
import os
import re
import uuid
from datetime import datetime, timezone
from typing import Any, Optional

import grpc
import redis
from fastapi import FastAPI, Request, Response, WebSocket, WebSocketDisconnect
from fastapi.responses import JSONResponse, PlainTextResponse

from app.config import settings
from app.grpc_clients.core import clients, map_grpc_err
from app.security import SessionClaims, issue_csrf_token, issue_session_token, verify_session_token
from app.proto_gen import auth_pb2, bot_pb2, common_pb2, entitlements_pb2, game_pb2, join_pb2, quiz_pb2, richcrab_pb2

rdb = redis.from_url(settings.redis_url, decode_responses=True)
app = FastAPI(title="QuizBattle Gateway API", docs_url="/docs", openapi_url="/openapi.json")


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


def set_auth(resp: Response, claims: SessionClaims):
    tok = issue_session_token(claims, settings.session_ttl_seconds)
    csrf = issue_csrf_token()
    resp.set_cookie(settings.session_cookie_name, tok, path=settings.session_cookie_path, secure=settings.session_cookie_secure, httponly=settings.session_cookie_httponly, samesite="lax")
    resp.set_cookie(settings.csrf_cookie_name, csrf, path=settings.csrf_cookie_path, secure=settings.csrf_cookie_secure, httponly=settings.csrf_cookie_httponly, samesite="lax")
    return csrf


@app.get("/health")
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


@app.get("/openapi.yaml")
def old_openapi():
    p = settings.openapi_path
    if not os.path.exists(p):
        return err(404, "not_found", "openapi schema file is missing")
    return PlainTextResponse(open(p).read())


@app.get("/csrf")
@app.get("/api/v1/auth/csrf")
def csrf():
    token = issue_csrf_token()
    r = JSONResponse({"token": token})
    r.set_cookie(settings.csrf_cookie_name, token, path=settings.csrf_cookie_path, secure=settings.csrf_cookie_secure, httponly=settings.csrf_cookie_httponly, samesite="lax")
    return r


@app.post("/logout")
@app.post("/api/v1/auth/logout")
def logout(req: Request):
    if (e := require_csrf(req)):
        return e
    r = Response(status_code=204)
    r.delete_cookie(settings.session_cookie_name, path=settings.session_cookie_path)
    r.delete_cookie(settings.csrf_cookie_name, path=settings.csrf_cookie_path)
    return r


@app.get("/api/v1/session")
def session(req: Request):
    s = session_from_req(req)
    if not s:
        return err(401, "unauthorized", "session cookie is missing or invalid")
    return {"authenticated": True, "role": s.role, "roomId": s.room_id, "pin": s.pin, "playerId": s.player_id, "userId": s.user_id, "exp": s.exp}


@app.post("/api/v1/auth/register")
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
    out = JSONResponse({"user": {"id": u.id, "email": u.email, "displayName": u.display_name, "avatarUrl": u.avatar_url}, "csrfToken": ""})
    token = set_auth(out, SessionClaims(session_type="auth", role="host", user_id=u.id))
    out.body = json.dumps({"user": {"id": u.id, "email": u.email, "displayName": u.display_name, "avatarUrl": u.avatar_url}, "csrfToken": token}).encode()
    return out


@app.post("/api/v1/auth/login")
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
    out = JSONResponse({"user": {"id": u.id, "email": u.email, "displayName": u.display_name, "avatarUrl": u.avatar_url}, "csrfToken": ""})
    token = set_auth(out, SessionClaims(session_type="auth", role="host", user_id=u.id))
    out.body = json.dumps({"user": {"id": u.id, "email": u.email, "displayName": u.display_name, "avatarUrl": u.avatar_url}, "csrfToken": token}).encode()
    return out


def require_user(req: Request) -> Optional[str]:
    s = session_from_req(req)
    if not s or s.role != "host" or not s.user_id:
        return None
    return s.user_id


def _bot_metadata(user_id: str):
    return (("x-user-id", user_id), ("x-user-role", "host"))


def _extract_webhook_url(status: str) -> str:
    m = re.match(r"webhook_set:([^\s]+)", status or "")
    return m.group(1) if m else ""


def _binding_key(bot_id: str) -> str:
    return f"tg:binding:{bot_id}"


def _operations_key(bot_id: str) -> str:
    return f"tg:ops:{bot_id}"


def _append_runtime_op(bot_id: str, op: dict[str, Any]):
    ops = json.loads(rdb.get(_operations_key(bot_id)) or "[]")
    ops.append(op)
    rdb.set(_operations_key(bot_id), json.dumps(ops[-50:]))


def _load_binding(bot_id: str) -> Optional[dict[str, Any]]:
    raw = rdb.get(_binding_key(bot_id))
    return json.loads(raw) if raw else None


@app.get("/api/v1/me")
def me(req: Request):
    uid = require_user(req)
    if not uid:
        return err(401, "unauthorized", "session cookie is missing or invalid")
    res = clients.auth.GetMe(auth_pb2.GetMeRequest(user_id=common_pb2.UserId(value=uid)))
    if not res.found:
        return err(404, "not_found", "user not found")
    u = res.user
    return {"id": u.id, "email": u.email, "displayName": u.display_name, "avatarUrl": u.avatar_url}


@app.patch("/api/v1/me")
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
    res = clients.auth.UpdateProfile(q)
    u = res.user
    return {"id": u.id, "email": u.email, "displayName": u.display_name, "avatarUrl": u.avatar_url}


@app.post("/api/v1/me/password")
def password(req: Request, body: dict[str, Any]):
    if (e := require_csrf(req)):
        return e
    uid = require_user(req)
    if not uid:
        return err(401, "unauthorized", "session cookie is missing or invalid")
    res = clients.auth.ChangePassword(auth_pb2.ChangePasswordRequest(user_id=common_pb2.UserId(value=uid), current_password=body["currentPassword"], new_password=body["newPassword"]))
    if res.mismatch:
        return err(401, "unauthorized", "current password mismatch")
    return Response(status_code=204)


@app.get("/api/v1/me/sessions")
def me_sessions():
    return err(501, "not_implemented", "/api/v1/me/sessions is not implemented")


@app.post("/api/v1/games")
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


@app.post("/api/v1/games/{pin}/invite/regenerate")
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


@app.post("/api/v1/games/{pin}/join")
def join_pin(pin: str, req: Request, body: dict[str, Any]):
    if (e := require_csrf(req)): return e
    t = clients.join.IssueJoinTicketByPin(join_pb2.IssueJoinTicketByPinRequest(pin=pin, display_name=body.get("name") or body.get("displayName")))
    j = clients.game.JoinRoom(game_pb2.JoinRoomRequest(join_ticket=t.ticket.token))
    return _join_response(pin, t.ticket.room_id.value, j.player_id.value)


@app.post("/api/v1/invites/{inviteToken}/join")
def join_inv(inviteToken: str, req: Request, body: dict[str, Any]):
    if (e := require_csrf(req)): return e
    t = clients.join.IssueJoinTicketByInvite(join_pb2.IssueJoinTicketByInviteRequest(invite_token=inviteToken, display_name=body.get("name") or body.get("displayName")))
    j = clients.game.JoinRoom(game_pb2.JoinRoomRequest(join_ticket=t.ticket.token))
    return _join_response("", t.ticket.room_id.value, j.player_id.value)


@app.get("/api/v1/games/{pin}")
@app.get("/api/v1/games/{pin}/state")
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


@app.post("/api/v1/games/{pin}/start")
def start(pin: str, req: Request): return _host_action(req, pin, "start")
@app.post("/api/v1/games/{pin}/pause")
def pause(pin: str, req: Request): return _host_action(req, pin, "pause")
@app.post("/api/v1/games/{pin}/resume")
def resume(pin: str, req: Request): return _host_action(req, pin, "resume")
@app.post("/api/v1/games/{pin}/next")
def nextq(pin: str, req: Request): return _host_action(req, pin, "next")


@app.post("/api/v1/games/{pin}/leave")
def leave(pin: str, req: Request):
    s = session_from_req(req)
    if not s or s.role != "player": return err(403, "forbidden", "only player can leave game")
    if (e := require_csrf(req)): return e
    clients.game.LeaveRoom(game_pb2.LeaveRoomRequest(room_id=common_pb2.RoomId(value=s.room_id), player_id=common_pb2.PlayerId(value=s.player_id)))
    r = Response(status_code=204)
    r.delete_cookie(settings.session_cookie_name, path=settings.session_cookie_path)
    r.delete_cookie(settings.csrf_cookie_name, path=settings.csrf_cookie_path)
    return r


@app.post("/api/v1/games/{pin}/kick")
def kick(pin: str, req: Request, body: dict[str, Any]):
    s = session_from_req(req)
    if not s or s.role != "host": return err(401, "unauthorized", "session cookie is missing or invalid")
    if (e := require_csrf(req)): return e
    clients.game.KickPlayer(game_pb2.KickPlayerRequest(room_id=common_pb2.RoomId(value=s.room_id), requested_by=common_pb2.UserId(value=s.user_id), player_id=common_pb2.PlayerId(value=body["playerId"])))
    return Response(status_code=204)

@app.post("/api/v1/bots")
def reg_bot(req: Request, body: dict[str, Any]):
    if (e := require_csrf(req)): return e
    uid = require_user(req)
    if not uid: return err(401,"unauthorized","session cookie is missing or invalid")
    b = clients.bot.RegisterBot(bot_pb2.RegisterBotRequest(name=body["name"], version=body["version"], endpoint=body["endpoint"]), metadata=_bot_metadata(uid))
    return {"bot": {"botId": b.bot.bot_id.value, "name": b.bot.name, "version": b.bot.version, "status": b.bot.status}}

@app.get("/api/v1/bots")
def list_bots(req: Request):
    uid = require_user(req)
    if not uid: return err(401,"unauthorized","session cookie is missing or invalid")
    x = clients.bot.ListBots(bot_pb2.ListBotsRequest(), metadata=_bot_metadata(uid))
    return {"bots": [{"botId": b.bot_id.value, "name": b.name, "version": b.version, "status": b.status} for b in x.bots]}

@app.get("/api/v1/bots/{botId}")
def get_bot(botId: str, req: Request):
    uid = require_user(req)
    if not uid: return err(401,"unauthorized","session cookie is missing or invalid")
    b = clients.bot.GetBotStatus(bot_pb2.GetBotStatusRequest(bot_id=common_pb2.BotId(value=botId)), metadata=_bot_metadata(uid)).bot
    return {"bot": {"botId": b.bot_id.value, "name": b.name, "version": b.version, "status": b.status}}

@app.patch("/api/v1/bots/{botId}")
def patch_bot(botId: str, req: Request, body: dict[str, Any]):
    if (e := require_csrf(req)): return e
    uid = require_user(req)
    if not uid: return err(401,"unauthorized","session cookie is missing or invalid")
    q = bot_pb2.UpdateBotStatusRequest(bot_id=common_pb2.BotId(value=botId))
    if "enabled" in body: q.enabled = body["enabled"]
    if "reason" in body: q.reason = body["reason"]
    b = clients.bot.UpdateBotStatus(q, metadata=_bot_metadata(uid)).bot
    return {"bot": {"botId": b.bot_id.value, "name": b.name, "version": b.version, "status": b.status}}

@app.delete("/api/v1/bots/{botId}")
def del_bot(botId: str, req: Request):
    if (e := require_csrf(req)): return e
    uid = require_user(req)
    if not uid: return err(401,"unauthorized","session cookie is missing or invalid")
    clients.bot.RemoveBot(bot_pb2.RemoveBotRequest(bot_id=common_pb2.BotId(value=botId)), metadata=_bot_metadata(uid))
    return Response(status_code=204)

@app.post("/api/v1/telegram/bots/connect")
def tg_connect(req: Request, body: dict[str,Any]):
    if (e := require_csrf(req)): return e
    uid = require_user(req)
    if not uid:
        return err(401, "unauthorized", "session cookie is missing or invalid")
    token = str(body.get("token") or body.get("botToken") or "").strip()
    if not token or ":" not in token:
        return err(422, "invalid_payload", "bot token is required")

    register = clients.bot.RegisterBot(
        bot_pb2.RegisterBotRequest(name=body.get("name", "Telegram bot"), version=body.get("version", "v1"), endpoint=token),
        metadata=_bot_metadata(uid),
    )
    bot = register.bot
    status_info = clients.bot.GetBotStatus(
        bot_pb2.GetBotStatusRequest(bot_id=common_pb2.BotId(value=bot.bot_id.value)),
        metadata=_bot_metadata(uid),
    ).bot
    webhook_url = _extract_webhook_url(status_info.status)
    webhook_secret = webhook_url.rsplit("/", 1)[-1] if webhook_url else ""
    binding = {
        "botId": bot.bot_id.value,
        "userId": uid,
        "botToken": token,
        "name": bot.name,
        "status": status_info.status,
        "webhookUrl": webhook_url,
        "webhookSecret": webhook_secret,
        "boundAt": datetime.now(timezone.utc).isoformat(),
    }
    rdb.set(_binding_key(bot.bot_id.value), json.dumps(binding))
    rdb.set(f"tg:user_binding:{uid}", bot.bot_id.value)
    return {
        "botId": bot.bot_id.value,
        "webhookUrl": webhook_url,
        "status": "connected" if webhook_url else "registered",
        "metadata": {
            "name": bot.name,
            "version": bot.version,
            "runtimeStatus": status_info.status,
        },
    }


def _send_tg_message(token: str, chat_id: int, text: str):
    import requests

    requests.post(
        f"https://api.telegram.org/bot{token}/sendMessage",
        json={"chat_id": chat_id, "text": text},
        timeout=3,
    )


def _handle_telegram_command(bot_id: str, binding: dict[str, Any], update: dict[str, Any]):
    msg = update.get("message") or {}
    txt = (msg.get("text") or "").strip()
    chat = (msg.get("chat") or {})
    chat_id = chat.get("id")
    if not txt or not chat_id:
        return
    parts = txt.split(" ")
    cmd = parts[0].lower()
    if cmd == "/newgame" and len(parts) >= 2:
        quiz_id = parts[1]
        title = " ".join(parts[2:]) or f"Telegram room {quiz_id}"
        room = clients.game.CreateRoom(game_pb2.CreateRoomRequest(owner_user_id=common_pb2.UserId(value=binding["userId"]), quiz_id=common_pb2.QuizId(value=quiz_id), title=title))
        room_state = {"roomId": room.room_id.value, "pin": room.pin, "inviteToken": room.invite_token, "invitePath": room.invite_path}
        rdb.set(f"tg:chat_room:{bot_id}:{chat_id}", json.dumps(room_state))
        _append_runtime_op(bot_id, {"id": uuid.uuid4().hex, "type": "room_created", "roomId": room.room_id.value, "roomTitle": title, "createdAt": datetime.now(timezone.utc).isoformat()})
        _send_tg_message(binding["botToken"], chat_id, f"Игра создана. PIN: {room.pin}\nInvite: {room.invite_path}")
    elif cmd == "/pin":
        room_state = json.loads(rdb.get(f"tg:chat_room:{bot_id}:{chat_id}") or "{}")
        if room_state.get("pin"):
            _append_runtime_op(bot_id, {"id": uuid.uuid4().hex, "type": "pin_issued", "value": room_state["pin"], "createdAt": datetime.now(timezone.utc).isoformat()})
            _send_tg_message(binding["botToken"], chat_id, f"PIN: {room_state['pin']}")
    elif cmd == "/invite":
        room_state = json.loads(rdb.get(f"tg:chat_room:{bot_id}:{chat_id}") or "{}")
        if room_state.get("invitePath"):
            invite_url = f"{settings.public_base_url}{room_state['invitePath']}"
            _append_runtime_op(bot_id, {"id": uuid.uuid4().hex, "type": "invite_issued", "value": invite_url, "createdAt": datetime.now(timezone.utc).isoformat()})
            _send_tg_message(binding["botToken"], chat_id, f"Invite: {invite_url}")

@app.post("/api/v1/telegram/webhook/{botId}/{secret}")
async def tg_webhook(botId: str, secret: str, req: Request):
    binding = _load_binding(botId)
    if not binding:
        return err(404, "not_found", "bot binding is missing")
    header_secret = req.headers.get("x-telegram-bot-api-secret-token", "")
    if not binding.get("webhookSecret") or secret != binding.get("webhookSecret") or header_secret != secret:
        return err(403, "forbidden", "invalid telegram webhook secret")
    update = await req.json()
    try:
        _handle_telegram_command(botId, binding, update)
    except grpc.RpcError as ex:
        c, b = map_grpc_err(ex, "telegram_webhook")
        return JSONResponse(b, status_code=c)
    return {"ok": True, "botId": botId, "status": "processed"}


@app.get("/api/v1/telegram/bots/status")
def tg_status(req: Request):
    uid = require_user(req)
    if not uid:
        return err(401, "unauthorized", "session cookie is missing or invalid")
    bot_id = rdb.get(f"tg:user_binding:{uid}")
    if not bot_id:
        return {"bindingId": "none", "active": False, "operations": []}
    binding = _load_binding(bot_id)
    if not binding:
        return {"bindingId": "none", "active": False, "operations": []}
    return {
        "bindingId": binding["botId"],
        "botId": binding["botId"],
        "username": binding.get("name"),
        "name": binding.get("name"),
        "active": True,
        "lastSeenAt": binding.get("boundAt"),
        "operations": json.loads(rdb.get(_operations_key(bot_id)) or "[]"),
    }


@app.delete("/api/v1/telegram/bots/{botId}")
def tg_unbind(botId: str, req: Request):
    if (e := require_csrf(req)):
        return e
    uid = require_user(req)
    if not uid:
        return err(401, "unauthorized", "session cookie is missing or invalid")
    clients.bot.RemoveBot(bot_pb2.RemoveBotRequest(bot_id=common_pb2.BotId(value=botId)), metadata=_bot_metadata(uid))
    rdb.delete(_binding_key(botId))
    rdb.delete(_operations_key(botId))
    if rdb.get(f"tg:user_binding:{uid}") == botId:
        rdb.delete(f"tg:user_binding:{uid}")
    return Response(status_code=204)

@app.get("/api/v1/quizzes")
def list_quizzes(limit: int = 20, pageToken: str = "", ownerUserId: str = ""):
    req = quiz_pb2.ListQuizzesRequest(page_size=limit, page_token=pageToken)
    if ownerUserId: req.owner_user_id.value = ownerUserId
    x = clients.quiz.ListQuizzes(req)
    return {"limit": limit, "nextPageToken": x.next_page_token, "items": [{"quizId": q.quiz_id.value, "ownerUserId": q.owner_user_id.value, "title": q.title, "description": q.description, "questions": [{"id":qq.id,"text":qq.text,"options":list(qq.options),"correctIndex":qq.correct_option_index if qq.HasField('correct_option_index') else None} for qq in q.questions]} for q in x.quizzes]}

@app.post("/api/v1/quizzes")
def create_quiz(req: Request, body: dict[str, Any]):
    if (e := require_csrf(req)): return e
    uid = require_user(req)
    if not uid: return err(401, "unauthorized", "session cookie is missing or invalid")
    q = quiz_pb2.CreateQuizRequest(owner_user_id=common_pb2.UserId(value=body.get("ownerUserId", uid)), title=body["title"], description=body.get("description", ""))
    for row in body.get("questions", []):
        qq = q.questions.add(); qq.id = row.get("id", ""); qq.text = row["text"]; qq.options.extend(row["options"])
        if "correctIndex" in row: qq.correct_option_index = row["correctIndex"]
    x = clients.quiz.CreateQuiz(q)
    return {"quiz": {"quizId": x.quiz.quiz_id.value, "ownerUserId": x.quiz.owner_user_id.value, "title": x.quiz.title, "description": x.quiz.description}, "status": "created"}

@app.get("/api/v1/quizzes/{quizId}")
def get_quiz(quizId: str):
    q = clients.quiz.GetQuiz(quiz_pb2.GetQuizRequest(quiz_id=common_pb2.QuizId(value=quizId))).quiz
    return {"quiz": {"quizId": q.quiz_id.value, "ownerUserId": q.owner_user_id.value, "title": q.title, "description": q.description, "questions": [{"id":qq.id,"text":qq.text,"options":list(qq.options)} for qq in q.questions]}}

@app.patch("/api/v1/quizzes/{quizId}")
def upd_quiz(quizId: str, req: Request, body: dict[str,Any]):
    if (e := require_csrf(req)): return e
    cur = clients.quiz.GetQuiz(quiz_pb2.GetQuizRequest(quiz_id=common_pb2.QuizId(value=quizId))).quiz
    if "title" in body: cur.title = body["title"]
    if "description" in body: cur.description = body["description"]
    x = clients.quiz.UpdateQuiz(quiz_pb2.UpdateQuizRequest(quiz=cur))
    return {"quiz": {"quizId": x.quiz.quiz_id.value, "ownerUserId": x.quiz.owner_user_id.value, "title": x.quiz.title, "description": x.quiz.description}, "status": "updated"}

@app.post("/api/v1/quizzes/{quizId}/publish")
def pub_quiz(quizId: str, req: Request):
    if (e := require_csrf(req)): return e
    uid = require_user(req)
    if not uid: return err(401,"unauthorized","session cookie is missing or invalid")
    x = clients.quiz.PublishQuiz(quiz_pb2.PublishQuizRequest(quiz_id=common_pb2.QuizId(value=quizId), requested_by=common_pb2.UserId(value=uid)))
    return {"quiz": {"quizId": x.quiz.quiz_id.value}, "publishedVersion": x.published_version, "status": "published"}

@app.post("/api/v1/quizzes/ai-generate")
def ai_start(req: Request, body: dict[str,Any]):
    if (e := require_csrf(req)): return e
    uid = require_user(req)
    if not uid: return err(401,"unauthorized","session cookie is missing or invalid")
    x = clients.quiz.StartAiQuizJob(quiz_pb2.StartAiQuizJobRequest(requested_by=common_pb2.UserId(value=uid), prompt=body["prompt"], desired_question_count=body.get("desiredQuestionCount",0)))
    return {"jobId": x.job_id, "status": x.status.lower()}

@app.get("/api/v1/quizzes/ai-jobs/{jobId}")
def ai_get(jobId: str, req: Request):
    uid = require_user(req)
    if not uid: return err(401,"unauthorized","session cookie is missing or invalid")
    x = clients.quiz.GetAiQuizJob(quiz_pb2.GetAiQuizJobRequest(job_id=jobId, requested_by=common_pb2.UserId(value=uid)))
    out = {"jobId": x.job_id, "status": x.status.lower()}
    if x.HasField("quiz"): out["quiz"] = {"quizId": x.quiz.quiz_id.value, "title": x.quiz.title}
    return out

@app.get("/api/v1/quizzes/ai-jobs/{jobId}/result")
def ai_result(jobId: str, req: Request):
    x = ai_get(jobId, req)
    if x["status"] != "done":
        return err(409, "not_implemented", "ai job is not done", {"error":"job_not_done","status": x["status"]})
    return x

@app.get("/api/v1/entitlements")
def ents(req: Request):
    uid = require_user(req)
    if not uid: return err(401,"unauthorized","session cookie is missing or invalid")
    usage = usage_impl(uid)
    return {"limits": [{"limit": "rooms", "used": usage["usage"]["rooms"], "max": 10}, {"limit": "bots", "used": usage["usage"]["bots"], "max": 20}, {"limit": "ai", "used": usage["usage"]["ai"], "max": 30}], "byLimit": {"rooms": {"limit": "rooms", "used": usage["usage"]["rooms"], "max": 10}, "bots": {"limit": "bots", "used": usage["usage"]["bots"], "max": 20}, "ai": {"limit": "ai", "used": usage["usage"]["ai"], "max": 30}}}


def usage_impl(uid: str):
    return {"usage": {"rooms": int(rdb.get(f"usage:{uid}:rooms") or 0), "bots": int(rdb.get(f"usage:{uid}:bots") or 0), "ai": int(rdb.get(f"usage:{uid}:ai") or 0)}}

@app.get("/api/v1/usage")
def usage(req: Request):
    uid = require_user(req)
    if not uid: return err(401,"unauthorized","session cookie is missing or invalid")
    return usage_impl(uid)

@app.get("/admin/api/stats")
def stats(req: Request):
    if not require_user(req): return err(403, "forbidden", "admin access required")
    x = clients.auth.GetAdminStats(auth_pb2.GetAdminStatsRequest())
    return {"usersCount": x.users_count, "gamesCount": x.games_count, "activeRooms": x.active_rooms}

@app.post("/admin/api/users/{userId}/ban")
def ban(userId: str, req: Request, body: dict[str,Any]):
    if (e := require_csrf(req)): return e
    if not require_user(req): return err(403, "forbidden", "admin access required")
    clients.auth.SetUserBan(auth_pb2.SetUserBanRequest(user_id=common_pb2.UserId(value=userId), banned=True, reason=body.get("reason","")))
    return Response(status_code=204)

@app.post("/admin/api/users/{userId}/unban")
def unban(userId: str, req: Request, body: dict[str,Any]):
    if (e := require_csrf(req)): return e
    if not require_user(req): return err(403, "forbidden", "admin access required")
    clients.auth.SetUserBan(auth_pb2.SetUserBanRequest(user_id=common_pb2.UserId(value=userId), banned=False, reason=body.get("reason","")))
    return Response(status_code=204)

@app.post("/admin/api/bots/{botId}/disable")
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
                await ws.send_json({"type": "room_event", "event": json.loads(str(ev).replace("\n", " "))})
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
