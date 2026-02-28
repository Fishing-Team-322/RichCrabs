import json
import uuid
import redis
from app.config import settings
from app.grpc_clients.core import clients
from app.proto_gen import bot_pb2

rdb = redis.from_url(settings.redis_url, decode_responses=True)


def binding_key(bot_id: str) -> str:
    return f"tg:binding:{bot_id}"


def bot_metadata(uid: str):
    return (("x-user-id", uid),)


def store_binding(bot_id: str, uid: str, token: str):
    secret = uuid.uuid4().hex[:24]
    rdb.set(binding_key(bot_id), json.dumps({"userId": uid, "secret": secret, "token": token}))
    return secret
