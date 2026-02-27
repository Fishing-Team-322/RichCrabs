import base64
import hashlib
import hmac
import json
import secrets
import time
from dataclasses import dataclass
from typing import Optional

from .config import settings


@dataclass
class SessionClaims:
    session_type: str = ""
    role: str = ""
    pin: str = ""
    room_id: str = ""
    player_id: str = ""
    user_id: str = ""
    exp: int = 0


def _b64u(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode().rstrip("=")


def _b64u_dec(data: str) -> bytes:
    return base64.urlsafe_b64decode(data + "=" * ((4 - len(data) % 4) % 4))


def issue_session_token(c: SessionClaims, ttl: int) -> str:
    payload = c.__dict__.copy()
    payload["exp"] = int(time.time()) + ttl
    body = _b64u(json.dumps(payload, separators=(",", ":")).encode())
    sig = _b64u(hmac.new(settings.session_signing_key.encode(), body.encode(), hashlib.sha256).hexdigest().encode())
    return f"{body}.{sig}"


def verify_session_token(token: str) -> Optional[SessionClaims]:
    if "." not in token:
        return None
    body, sig = token.split(".", 1)
    expected = _b64u(hmac.new(settings.session_signing_key.encode(), body.encode(), hashlib.sha256).hexdigest().encode())
    if not hmac.compare_digest(sig, expected):
        return None
    payload = json.loads(_b64u_dec(body))
    if int(payload.get("exp", 0)) <= int(time.time()):
        return None
    return SessionClaims(**{k: payload.get(k, "") for k in SessionClaims().__dict__.keys()})


def issue_csrf_token() -> str:
    return secrets.token_hex(32)
