import json
import grpc
from fastapi import APIRouter, Request, Response
from fastapi.responses import JSONResponse
from app.api.common import err
from app.api.dependencies.auth import require_user
from app.api.dependencies.csrf import require_csrf
from app.config import settings
from app.grpc_clients.core import clients, map_grpc_err
from app.proto_gen import bot_pb2, common_pb2
from app.schemas import RegisterBotRequest, TelegramConnectRequest, UpdateBotRequest
from app.services.bot_service import bot_metadata, binding_key, rdb, store_binding

router = APIRouter(tags=["bots"])

@router.post('/api/v1/bots')
def reg_bot(req: Request, body: RegisterBotRequest):
    if (e := require_csrf(req)): return e
    uid = require_user(req)
    if not uid: return err(401,'unauthorized','session cookie is missing or invalid')
    try:
        b = clients.bot.RegisterBot(bot_pb2.RegisterBotRequest(name=body.name, version=body.version, endpoint=body.endpoint), metadata=bot_metadata(uid))
    except grpc.RpcError as ex:
        c, b = map_grpc_err(ex, 'bot_register'); return JSONResponse(b, status_code=c)
    return {'bot': {'botId': b.bot.bot_id.value, 'name': b.bot.name, 'version': b.bot.version, 'status': b.bot.status}}

@router.get('/api/v1/bots')
def list_bots(req: Request):
    uid = require_user(req)
    if not uid: return err(401,'unauthorized','session cookie is missing or invalid')
    x = clients.bot.ListBots(bot_pb2.ListBotsRequest(), metadata=bot_metadata(uid))
    return {'bots': [{'botId': b.bot_id.value, 'name': b.name, 'version': b.version, 'status': b.status} for b in x.bots]}

@router.get('/api/v1/bots/{botId}')
def get_bot(botId: str, req: Request):
    uid = require_user(req)
    if not uid: return err(401,'unauthorized','session cookie is missing or invalid')
    b = clients.bot.GetBotStatus(bot_pb2.GetBotStatusRequest(bot_id=common_pb2.BotId(value=botId)), metadata=bot_metadata(uid)).bot
    return {'bot': {'botId': b.bot_id.value, 'name': b.name, 'version': b.version, 'status': b.status}}

@router.patch('/api/v1/bots/{botId}')
def patch_bot(botId: str, req: Request, body: UpdateBotRequest):
    if (e := require_csrf(req)): return e
    uid = require_user(req)
    if not uid: return err(401,'unauthorized','session cookie is missing or invalid')
    q = bot_pb2.UpdateBotStatusRequest(bot_id=common_pb2.BotId(value=botId))
    if body.enabled is not None: q.enabled = body.enabled
    if body.reason is not None: q.reason = body.reason
    b = clients.bot.UpdateBotStatus(q, metadata=bot_metadata(uid)).bot
    return {'bot': {'botId': b.bot_id.value, 'name': b.name, 'version': b.version, 'status': b.status}}

@router.delete('/api/v1/bots/{botId}')
def del_bot(botId: str, req: Request):
    if (e := require_csrf(req)): return e
    uid = require_user(req)
    if not uid: return err(401,'unauthorized','session cookie is missing or invalid')
    clients.bot.RemoveBot(bot_pb2.RemoveBotRequest(bot_id=common_pb2.BotId(value=botId)), metadata=bot_metadata(uid))
    return Response(status_code=204)

@router.post('/api/v1/telegram/bots/connect')
def tg_connect(req: Request, body: TelegramConnectRequest):
    if (e := require_csrf(req)): return e
    uid = require_user(req)
    if not uid: return err(401,'unauthorized','session cookie is missing or invalid')
    token = body.token.strip()
    if ':' not in token or not token.split(':', 1)[0].isdigit():
        return err(422, 'validation_error', 'telegram token format is invalid')
    b = clients.bot.RegisterBot(bot_pb2.RegisterBotRequest(name='Telegram', version='telegram', endpoint=f"telegram://{token.split(':', 1)[0]}"), metadata=bot_metadata(uid)).bot
    secret = store_binding(b.bot_id.value, uid, token)
    return {'botId': b.bot_id.value, 'webhookUrl': f"{settings.public_base_url}/api/v1/telegram/webhook/{b.bot_id.value}/{secret}", 'status': 'connected'}

@router.get('/api/v1/telegram/bots/status')
def tg_status(req: Request):
    uid = require_user(req)
    if not uid: return err(401,'unauthorized','session cookie is missing or invalid')
    bots = clients.bot.ListBots(bot_pb2.ListBotsRequest(), metadata=bot_metadata(uid)).bots
    for b in bots:
        if rdb.get(binding_key(b.bot_id.value)):
            return {'active': True, 'botId': b.bot_id.value}
    return {'active': False, 'botId': ''}

@router.delete('/api/v1/telegram/bots/{botId}')
def tg_unbind(botId: str, req: Request):
    if (e := require_csrf(req)): return e
    uid = require_user(req)
    if not uid: return err(401,'unauthorized','session cookie is missing or invalid')
    clients.bot.RemoveBot(bot_pb2.RemoveBotRequest(bot_id=common_pb2.BotId(value=botId)), metadata=bot_metadata(uid))
    rdb.delete(binding_key(botId))
    return Response(status_code=204)

@router.post('/api/v1/telegram/webhook/{botId}/{secret}')
def tg_webhook(botId: str, secret: str, req: Request):
    row = rdb.get(binding_key(botId))
    if not row: return {'status': 'ignored', 'botId': botId}
    try: parsed = json.loads(row)
    except Exception: return {'status': 'ignored', 'botId': botId}
    if req.headers.get('x-telegram-bot-api-secret-token', '') != secret: return {'status': 'ignored', 'botId': botId}
    return {'status': 'processed', 'botId': botId}
