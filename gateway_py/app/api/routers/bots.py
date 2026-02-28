import hmac

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
from app.services.bot_service import bot_metadata, binding_key, parse_binding, rdb, store_binding

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


def _client_ip(req: Request) -> str:
    forwarded_for = req.headers.get("x-forwarded-for", "")
    if forwarded_for:
        return forwarded_for.split(",", 1)[0].strip()
    real_ip = req.headers.get("x-real-ip", "")
    if real_ip:
        return real_ip.strip()
    return req.client.host if req.client else ""


def _allow_rate_limit(bot_id: str, client_ip: str) -> bool:
    limit = settings.telegram_webhook_rate_limit_per_minute
    if limit <= 0:
        return True

    key = f"rl:telegram_webhook:bot:{bot_id}:ip:{client_ip}"
    try:
        current = int(rdb.incr(key))
        if current == 1:
            rdb.expire(key, 60)
    except Exception:
        return True

    return current <= limit


@router.post('/api/v1/telegram/webhook/{botId}/{secret}')
def tg_webhook(botId: str, secret: str, req: Request):
    header_secret = req.headers.get('x-telegram-bot-api-secret-token', '')
    if not header_secret:
        return err(401, 'unauthorized', 'telegram secret header is required')

    row = rdb.get(binding_key(botId))
    if not row:
        return err(404, 'not_found', 'bot not found')

    try:
        parsed = parse_binding(botId, row)
    except Exception:
        return err(404, 'not_found', 'bot not found')

    expected_secret = parsed.get('secret', '')
    if not hmac.compare_digest(secret.encode(), expected_secret.encode()):
        return err(403, 'forbidden', 'invalid webhook secret')

    if not hmac.compare_digest(header_secret.encode(), expected_secret.encode()):
        return err(403, 'forbidden', 'telegram secret header mismatch')

    client_ip = _client_ip(req)
    if settings.telegram_webhook_ip_allowlist and client_ip not in settings.telegram_webhook_ip_allowlist:
        return err(403, 'forbidden', 'telegram source ip is not allowed')

    if not _allow_rate_limit(botId, client_ip):
        return err(429, 'too_many_attempts', 'rate limit exceeded')

    return {'status': 'processed', 'botId': botId}
