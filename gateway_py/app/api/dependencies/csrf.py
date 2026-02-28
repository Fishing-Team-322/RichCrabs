from fastapi import Request
from app.config import settings
from app.api.common import err


def require_csrf(req: Request):
    c = req.cookies.get(settings.csrf_cookie_name)
    h = req.headers.get(settings.csrf_header_name)
    if not c or not h or c != h:
        return err(403, "csrf_required", "csrf token mismatch")
    return None
