from pydantic import BaseModel
import os


def _b(name: str, default: bool) -> bool:
    v = os.getenv(name)
    if v is None:
        return default
    return v.lower() in {"1", "true", "yes"}


class Config(BaseModel):
    listen_host: str = os.getenv("GW_LISTEN_HOST", "0.0.0.0")
    listen_port: int = int(os.getenv("GW_LISTEN_PORT", "8080"))
    public_base_url: str = os.getenv("GW_PUBLIC_BASE_URL", "http://localhost:8080")
    openapi_path: str = os.getenv("GW_OPENAPI_PATH", "./api/openapi.yaml")
    grpc_game_addr: str = os.getenv("GW_GRPC_GAME_ADDR", "game:50051")
    grpc_join_addr: str = os.getenv("GW_GRPC_JOIN_ADDR", "join:50052")
    grpc_quiz_addr: str = os.getenv("GW_GRPC_QUIZ_ADDR", "quiz:50053")
    grpc_entitlements_addr: str = os.getenv("GW_GRPC_ENTITLEMENTS_ADDR", "entitlements:50054")
    grpc_bot_addr: str = os.getenv("GW_GRPC_BOT_ADDR", "bot:50055")
    grpc_auth_addr: str = os.getenv("GW_GRPC_AUTH_ADDR", "auth:50056")
    redis_url: str = os.getenv("GW_REDIS_URL", "redis://redis:6379")
    telegram_token_keyring: str = os.getenv("GW_TELEGRAM_TOKEN_KEYRING", "v1:dev-insecure-telegram-token-key")
    session_signing_key: str = os.getenv("GW_SESSION_SIGNING_KEY", "dev-insecure-session-key")
    session_cookie_name: str = os.getenv("GW_SESSION_COOKIE_NAME", "QB-SESSION")
    session_cookie_secure: bool = _b("GW_SESSION_COOKIE_SECURE", False)
    session_cookie_httponly: bool = _b("GW_SESSION_COOKIE_HTTPONLY", True)
    session_cookie_path: str = os.getenv("GW_SESSION_COOKIE_PATH", "/")
    session_ttl_seconds: int = int(os.getenv("GW_SESSION_TTL_SECONDS", "86400"))
    csrf_cookie_name: str = os.getenv("GW_CSRF_COOKIE_NAME", "XSRF-TOKEN")
    csrf_header_name: str = os.getenv("GW_CSRF_HEADER_NAME", "X-XSRF-TOKEN")
    csrf_cookie_secure: bool = _b("GW_CSRF_COOKIE_SECURE", False)
    csrf_cookie_httponly: bool = _b("GW_CSRF_COOKIE_HTTPONLY", False)
    csrf_cookie_path: str = os.getenv("GW_CSRF_COOKIE_PATH", "/")


settings = Config()
