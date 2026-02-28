from __future__ import annotations
from datetime import datetime, timedelta, timezone
from typing import Optional
import base64, hashlib, hmac, json, secrets
from pydantic import BaseModel
from fastapi import Response
from app.config import settings


class SessionClaims(BaseModel):
    session_type: str = "auth"
    role: str
    user_id: str = ""
    room_id: str = ""
    pin: str = ""
    player_id: str = ""
    exp: int = 0


def _b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode().rstrip('=')


def _unb64(data: str) -> bytes:
    return base64.urlsafe_b64decode(data + '=' * (-len(data) % 4))


def issue_session_token(claims: SessionClaims, ttl_seconds: int | None = None, ttl: int | None = None) -> str:
    lifetime = ttl if ttl is not None else ttl_seconds
    if lifetime is None:
        lifetime = settings.session_ttl_seconds
    payload = claims.model_dump()
    payload['exp'] = int((datetime.now(timezone.utc) + timedelta(seconds=lifetime)).timestamp())
    body = _b64(json.dumps(payload, separators=(',', ':')).encode())
    sig = _b64(hmac.new(settings.session_signing_key.encode(), body.encode(), hashlib.sha256).digest())
    return f"{body}.{sig}"


def verify_session_token(token: str) -> Optional[SessionClaims]:
    try:
        body, sig = token.split('.', 1)
        expected = _b64(hmac.new(settings.session_signing_key.encode(), body.encode(), hashlib.sha256).digest())
        if not hmac.compare_digest(sig, expected): return None
        payload = json.loads(_unb64(body))
        if int(payload.get('exp', 0)) <= int(datetime.now(timezone.utc).timestamp()): return None
        return SessionClaims(**payload)
    except Exception:
        return None


def issue_csrf_token() -> str:
    return secrets.token_urlsafe(24)


def set_auth(resp: Response, claims: SessionClaims, csrf_token: Optional[str] = None):
    tok = issue_session_token(claims, settings.session_ttl_seconds)
    csrf = csrf_token or issue_csrf_token()
    resp.set_cookie(settings.session_cookie_name, tok, path=settings.session_cookie_path, secure=settings.session_cookie_secure, httponly=settings.session_cookie_httponly, samesite='lax')
    resp.set_cookie(settings.csrf_cookie_name, csrf, path=settings.csrf_cookie_path, secure=settings.csrf_cookie_secure, httponly=settings.csrf_cookie_httponly, samesite='lax')
    return csrf
