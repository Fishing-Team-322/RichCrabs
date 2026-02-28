import base64
import hashlib
import hmac
import json
from datetime import datetime, timezone

from fastapi import APIRouter, Query
from fastapi.responses import JSONResponse, RedirectResponse

from app.config import settings
from app.security import SessionClaims, set_auth

router = APIRouter(tags=["telegram"])


def _unb64(data: str) -> bytes:
    return base64.urlsafe_b64decode(data + "=" * (-len(data) % 4))


@router.get("/api/v1/telegram/webapp/launch")
def telegram_webapp_launch(payload: str = Query(...), sig: str = Query(...)):
    expected = base64.urlsafe_b64encode(
        hmac.new(
            settings.telegram_webapp_signing_key.encode(),
            payload.encode(),
            hashlib.sha256,
        ).digest()
    ).decode().rstrip("=")
    if not hmac.compare_digest(sig, expected):
        return JSONResponse(
            status_code=401,
            content={"error": "invalid_signature", "message": "telegram webapp signature mismatch"},
        )

    try:
        claims = json.loads(_unb64(payload).decode())
    except Exception:
        return JSONResponse(
            status_code=400,
            content={"error": "invalid_payload", "message": "telegram webapp payload is invalid"},
        )

    exp = int(claims.get("exp", 0))
    if exp <= int(datetime.now(timezone.utc).timestamp()):
        return JSONResponse(
            status_code=401,
            content={"error": "expired", "message": "telegram webapp token expired"},
        )

    user_id = str(claims.get("user_id", ""))
    bot_id = str(claims.get("bot_id", ""))
    chat_id = str(claims.get("chat_id", ""))
    request_id = str(claims.get("request_id", ""))
    if not all([user_id, bot_id, chat_id, request_id]):
        return JSONResponse(
            status_code=422,
            content={"error": "validation_error", "message": "required launch fields are missing"},
        )

    response = RedirectResponse(url=settings.telegram_webapp_quiz_url, status_code=302)
    set_auth(
        response,
        SessionClaims(
            session_type="telegram_webapp",
            role="player",
            user_id=f"tg:{user_id}",
            player_id=f"tg:{user_id}",
        ),
    )
    response.headers["X-Telegram-Bot-Id"] = bot_id
    response.headers["X-Telegram-Chat-Id"] = chat_id
    response.headers["X-Telegram-Request-Id"] = request_id
    return response
