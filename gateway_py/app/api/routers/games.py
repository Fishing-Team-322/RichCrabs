import grpc
from fastapi import APIRouter, Request, Response
from fastapi.responses import JSONResponse
from app.api.common import err
from app.api.dependencies.auth import require_user, session_from_req
from app.api.dependencies.csrf import require_csrf
from app.config import settings
from app.grpc_clients.core import clients, map_grpc_err
from app.mappers.room_mapper import canonical_invite_path, settings_to_dict, visibility_from_settings
from app.proto_gen import common_pb2, game_pb2, join_pb2
from app.schemas import CreateGameRequest, JoinRequest, KickRequest
from app.security import SessionClaims, issue_session_token, set_auth
from app.services.game_service import list_rooms, resolve_host_room

router = APIRouter(tags=["games"])


def _join_response(pin: str, room_id: str, player_id: str):
    claims = SessionClaims(session_type="game", role="player", pin=pin, room_id=room_id, player_id=player_id)
    out = JSONResponse({"playerId": player_id, "joinTicket": issue_session_token(claims, settings.session_ttl_seconds), "expiresInSec": settings.session_ttl_seconds, "roomPin": pin, "team": "A", "role": "player", "wsUrl": f"{settings.public_base_url}/ws"})
    set_auth(out, claims)
    return out


@router.get("/api/v1/games")
def list_games(req: Request):
    uid = require_user(req)
    try:
        return list_rooms(owner_user_id=uid, include_public=True) if uid else list_rooms(include_public=True)
    except grpc.RpcError as ex:
        c, b = map_grpc_err(ex, "list_games")
        return JSONResponse(b, status_code=c)


@router.post("/api/v1/games")
def create_game(req: Request, body: CreateGameRequest):
    if (e := require_csrf(req)): return e
    uid = require_user(req)
    if not uid or body.ownerUserId != uid:
        return err(403, "forbidden", "ownerUserId must match host session")
    try:
        visibility = game_pb2.RoomVisibility.ROOM_VISIBILITY_PUBLIC if body.settings.privacy == "public" else game_pb2.RoomVisibility.ROOM_VISIBILITY_PRIVATE
        x = clients.game.CreateRoom(game_pb2.CreateRoomRequest(owner_user_id=common_pb2.UserId(value=uid), quiz_id=common_pb2.QuizId(value=body.quizId), title=body.title, settings=game_pb2.RoomSettings(player_limit=body.settings.playerLimit, visibility=visibility, timers=game_pb2.RoomTimers(lobby_timer_sec=body.settings.timers.lobbyTimerSec, question_timer_sec=body.settings.timers.questionTimerSec, answer_reveal_sec=body.settings.timers.answerRevealSec))))
    except grpc.RpcError as ex:
        c, b = map_grpc_err(ex, "create_room")
        return JSONResponse(b, status_code=c)
    claims = SessionClaims(session_type="game", role="host", pin=x.pin, room_id=x.room_id.value, user_id=uid)
    out = JSONResponse({"pin": x.pin, "inviteToken": x.invite_token, "invitePath": canonical_invite_path(x.invite_token), "inviteQrSvg": x.invite_qr_svg, "wsUrl": f"{settings.public_base_url}/ws", "settings": settings_to_dict(getattr(x, "settings", None)), "isPublic": visibility_from_settings(getattr(x, "settings", None)) == "public"})
    set_auth(out, claims)
    return out


@router.post("/api/v1/games/{pin}/invite/regenerate")
def regenerate_invite(pin: str, req: Request):
    s = session_from_req(req)
    if not s or s.role != "host" or not s.user_id: return err(401, "unauthorized", "session cookie is missing or invalid")
    if (e := require_csrf(req)): return e
    room = resolve_host_room(s.user_id, pin)
    if not room: return err(404, "not_found", "room not found")
    x = clients.game.RegenerateInvite(game_pb2.RegenerateInviteRequest(room_id=common_pb2.RoomId(value=room["roomId"]), requested_by=common_pb2.UserId(value=s.user_id)))
    return {"inviteToken": x.invite_token, "invitePath": canonical_invite_path(x.invite_token), "inviteQrSvg": x.invite_qr_svg}


@router.post("/api/v1/games/{pin}/join")
def join_pin(pin: str, req: Request, body: JoinRequest):
    if (e := require_csrf(req)): return e
    name = body.name or body.displayName
    t = clients.join.IssueJoinTicketByPin(join_pb2.IssueJoinTicketByPinRequest(pin=pin, display_name=name))
    j = clients.game.JoinRoom(game_pb2.JoinRoomRequest(join_ticket=t.ticket.token))
    return _join_response(pin, t.ticket.room_id.value, j.player_id.value)


@router.post("/api/v1/invites/{inviteToken}/join")
def join_inv(inviteToken: str, req: Request, body: JoinRequest):
    if (e := require_csrf(req)): return e
    name = body.name or body.displayName
    t = clients.join.IssueJoinTicketByInvite(join_pb2.IssueJoinTicketByInviteRequest(invite_token=inviteToken, display_name=name))
    j = clients.game.JoinRoom(game_pb2.JoinRoomRequest(join_ticket=t.ticket.token))
    return _join_response("", t.ticket.room_id.value, j.player_id.value)


@router.get("/api/v1/games/{pin}")
@router.get("/api/v1/games/{pin}/state")
def state(pin: str, req: Request):
    s = session_from_req(req)
    if not s: return err(401, "unauthorized", "session cookie is missing or invalid")
    if s.role == "host" and s.user_id:
        room = resolve_host_room(s.user_id, pin)
        if not room: return err(404, "not_found", "room not found")
        return room
    st = clients.game.GetRoomState(game_pb2.GetRoomStateRequest(room_id=common_pb2.RoomId(value=s.room_id)))
    return {"pin": st.pin or pin, "state": st.state, "players": [{"playerId": p.player_id.value, "name": p.display_name, "score": p.score} for p in st.players], "roomId": st.room_id.value if st.room_id else "", "quizId": st.quiz_id.value if getattr(st, "quiz_id", None) else "", "title": getattr(st, "title", ""), "hostUserId": st.owner_user_id.value if getattr(st, "owner_user_id", None) else "", "invitePath": getattr(st, "invite_path", ""), "settings": settings_to_dict(getattr(st, "settings", None)), "isPublic": visibility_from_settings(getattr(st, "settings", None)) == "public"}


def _host_action(req: Request, pin: str, action: str):
    s = session_from_req(req)
    if not s or s.role != "host" or not s.user_id: return err(401, "unauthorized", "session cookie is missing or invalid")
    if (e := require_csrf(req)): return e
    room = resolve_host_room(s.user_id, pin)
    if not room: return err(404, "not_found", "room not found")
    fn = {"start": clients.game.StartGame, "pause": clients.game.PauseGame, "resume": clients.game.ResumeGame, "next": clients.game.NextQuestion}[action]
    rq = {"start": game_pb2.StartGameRequest, "pause": game_pb2.PauseGameRequest, "resume": game_pb2.ResumeGameRequest, "next": game_pb2.NextQuestionRequest}[action]
    try:
        fn(rq(room_id=common_pb2.RoomId(value=s.room_id), requested_by=common_pb2.UserId(value=s.user_id)))
    except grpc.RpcError as ex:
        c, b = map_grpc_err(ex, f"game_{action}")
        return JSONResponse(b, status_code=c)
    return Response(status_code=204)


@router.post("/api/v1/games/{pin}/start")
def start(pin: str, req: Request): return _host_action(req, pin, "start")
@router.post("/api/v1/games/{pin}/pause")
def pause(pin: str, req: Request): return _host_action(req, pin, "pause")
@router.post("/api/v1/games/{pin}/resume")
def resume(pin: str, req: Request): return _host_action(req, pin, "resume")
@router.post("/api/v1/games/{pin}/next")
def nextq(pin: str, req: Request): return _host_action(req, pin, "next")


@router.post("/api/v1/games/{pin}/leave")
def leave(pin: str, req: Request):
    s = session_from_req(req)
    if not s or s.role != "player": return err(403, "forbidden", "only player can leave game")
    if (e := require_csrf(req)): return e
    clients.game.LeaveRoom(game_pb2.LeaveRoomRequest(room_id=common_pb2.RoomId(value=s.room_id), player_id=common_pb2.PlayerId(value=s.player_id)))
    r = Response(status_code=204)
    r.delete_cookie(settings.session_cookie_name, path=settings.session_cookie_path)
    r.delete_cookie(settings.csrf_cookie_name, path=settings.csrf_cookie_path)
    return r


@router.post("/api/v1/games/{pin}/kick")
def kick(pin: str, req: Request, body: KickRequest):
    s = session_from_req(req)
    if not s or s.role != "host": return err(401, "unauthorized", "session cookie is missing or invalid")
    if (e := require_csrf(req)): return e
    clients.game.KickPlayer(game_pb2.KickPlayerRequest(room_id=common_pb2.RoomId(value=s.room_id), requested_by=common_pb2.UserId(value=s.user_id), player_id=common_pb2.PlayerId(value=body.playerId)))
    return Response(status_code=204)
