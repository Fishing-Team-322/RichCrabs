from fastapi import APIRouter, Request, Response
from app.api.common import err
from app.api.dependencies.auth import require_user
from app.api.dependencies.csrf import require_csrf
from app.grpc_clients.core import clients
from app.proto_gen import auth_pb2, bot_pb2, common_pb2
from app.schemas import BanRequest

router = APIRouter(tags=['admin'])

@router.get('/admin/api/stats')
def stats(req: Request):
    if not require_user(req): return err(403, 'forbidden', 'admin access required')
    x = clients.auth.GetAdminStats(auth_pb2.GetAdminStatsRequest())
    return {'usersCount': x.users_count, 'gamesCount': x.games_count, 'activeRooms': x.active_rooms}

@router.post('/admin/api/users/{userId}/ban')
def ban(userId: str, req: Request, body: BanRequest):
    if (e := require_csrf(req)): return e
    if not require_user(req): return err(403, 'forbidden', 'admin access required')
    clients.auth.SetUserBan(auth_pb2.SetUserBanRequest(user_id=common_pb2.UserId(value=userId), banned=True, reason=body.reason or ''))
    return Response(status_code=204)

@router.post('/admin/api/users/{userId}/unban')
def unban(userId: str, req: Request, body: BanRequest):
    if (e := require_csrf(req)): return e
    if not require_user(req): return err(403, 'forbidden', 'admin access required')
    clients.auth.SetUserBan(auth_pb2.SetUserBanRequest(user_id=common_pb2.UserId(value=userId), banned=False, reason=body.reason or ''))
    return Response(status_code=204)

@router.post('/admin/api/bots/{botId}/disable')
def admin_disable(botId: str, req: Request, body: BanRequest):
    if (e := require_csrf(req)): return e
    if not require_user(req): return err(403, 'forbidden', 'admin access required')
    clients.bot.UpdateBotStatus(bot_pb2.UpdateBotStatusRequest(bot_id=common_pb2.BotId(value=botId), enabled=False, reason=body.reason or ''))
    return Response(status_code=204)
