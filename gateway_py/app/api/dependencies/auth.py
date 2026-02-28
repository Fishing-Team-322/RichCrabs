from __future__ import annotations
from typing import Optional
from fastapi import Request
from app.config import settings
from app.security import SessionClaims, verify_session_token


def session_from_req(req: Request) -> Optional[SessionClaims]:
    token = req.cookies.get(settings.session_cookie_name)
    return verify_session_token(token) if token else None


def require_user(req: Request) -> Optional[str]:
    session = session_from_req(req)
    if not session or session.role != "host" or not session.user_id:
        return None
    return session.user_id
