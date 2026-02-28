import json
import uuid

import redis
from app.config import settings
from app.grpc_clients.core import clients
from app.proto_gen import bot_pb2
from app.services.token_crypto import EncryptedToken, TokenCrypto

rdb = redis.from_url(settings.redis_url, decode_responses=True)
token_crypto = TokenCrypto.from_keyring(settings.telegram_token_keyring)


def binding_key(bot_id: str) -> str:
    return f"tg:binding:{bot_id}"


def bot_metadata(uid: str):
    return (("x-user-id", uid),)


def store_binding(bot_id: str, uid: str, token: str):
    secret = uuid.uuid4().hex[:24]
    encrypted = token_crypto.encrypt(token)
    payload = {
        "userId": uid,
        "secret": secret,
        "tokenCiphertext": encrypted.ciphertext,
        "tokenNonce": encrypted.nonce,
        "tokenKeyVersion": encrypted.key_version,
    }
    rdb.set(binding_key(bot_id), json.dumps(payload))
    return secret


def parse_binding(bot_id: str, row: str):
    parsed = json.loads(row)

    if "tokenCiphertext" in parsed and "tokenNonce" in parsed and "tokenKeyVersion" in parsed:
        return parsed

    legacy_token = parsed.get("token")
    if not legacy_token:
        return parsed

    encrypted = token_crypto.encrypt(legacy_token)
    parsed.pop("token", None)
    parsed["tokenCiphertext"] = encrypted.ciphertext
    parsed["tokenNonce"] = encrypted.nonce
    parsed["tokenKeyVersion"] = encrypted.key_version
    rdb.set(binding_key(bot_id), json.dumps(parsed))
    return parsed


def decrypt_binding_token(parsed: dict) -> str:
    encrypted = EncryptedToken(
        ciphertext=parsed["tokenCiphertext"],
        nonce=parsed["tokenNonce"],
        key_version=parsed["tokenKeyVersion"],
    )
    return token_crypto.decrypt(encrypted)
