from __future__ import annotations
from typing import Any
from fastapi.responses import JSONResponse


def err(code: int, error: str, message: str, details: Any = None):
    body: dict[str, Any] = {"error": error, "message": message}
    if details is not None:
        body["details"] = details
    return JSONResponse(body, status_code=code)
