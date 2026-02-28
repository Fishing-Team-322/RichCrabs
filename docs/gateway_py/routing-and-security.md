# Gateway Python: routing and security

## Router layer (`gateway_py/app/api/routers/*.py`)

### Ответственность
- Принимать HTTP/WS запросы и возвращать стабильный клиентский контракт.
- Оркестрировать вызовы в gRPC через `app.grpc_clients.core.clients`.
- Применять security-проверки перед мутациями состояния.

### Ключевые роутеры и сценарии
- `auth.py`:
  - `GET /csrf` и `/api/v1/auth/csrf` — выдача CSRF токена и cookie.
  - `POST /api/v1/auth/login|register` — проверка CSRF, вызов auth gRPC, установка session+csrf cookies.
  - `POST /logout` и `/api/v1/auth/logout` — проверка CSRF, удаление cookie.
  - `GET /api/v1/session` — introspection текущей сессии.
- `system.py`:
  - `GET /health` и `/api/v1/healthz` — health-check; при `grpc_check=true` проверяется `health.Ping`.
  - `GET /openapi.yaml` — отдаёт схему по `settings.openapi_path`.
- `games.py`, `quizzes.py`, `bots.py`, `billing.py`, `profile.py`, `admin.py`:
  - используют единый шаблон: auth/csrf guard → gRPC/service вызов → JSON/204.
- `ws.py`:
  - `GET /ws` (websocket): handshake, проверка токена, streaming room events.

### Пример HTTP flow (host login + create game)
1. `GET /api/v1/auth/csrf` → клиент получает XSRF cookie + token.
2. `POST /api/v1/auth/login` с cookie+header CSRF → gateway вызывает auth gRPC → возвращает `user`, ставит `QB-SESSION` и новый `XSRF-TOKEN`.
3. `POST /api/v1/games` с session cookie + CSRF header → gateway создаёт комнату в game service и возвращает `pin/invite/wsUrl`.

### Пример WS flow (player realtime)
1. `POST /api/v1/games/{pin}/join` возвращает `joinTicket` и cookies.
2. Клиент открывает `/ws` с cookie или query `joinTicket`.
3. Сервер отправляет `{"type":"hello"}`.
4. Далее клиент получает `room_event`, может отправлять `ping/get_state`.

## Security dependencies (`gateway_py/app/api/dependencies/*.py`)

### `auth.py`
- `session_from_req(req)` достаёт cookie `settings.session_cookie_name` и валидирует через `verify_session_token()`.
- `require_user(req)` пропускает только `role == "host"` и непустой `user_id`.

### `csrf.py`
- `require_csrf(req)` требует совпадения cookie `settings.csrf_cookie_name` и header `settings.csrf_header_name`.
- При mismatch возвращается `403 csrf_required`.

## Session/CSRF механика (`gateway_py/app/security.py`, `auth.py`, `csrf.py`)

### Как это работает
- Session token = `base64(payload).base64(hmac_sha256(payload, session_signing_key))`.
- `payload` содержит `session_type`, `role`, `user_id|room_id|player_id`, `exp`.
- CSRF token генерируется `secrets.token_urlsafe(24)` и хранится в cookie (double-submit pattern).
- `set_auth()` централизованно выставляет обе cookie (`samesite=lax`, secure/httpOnly/path берутся из `gateway_py/app/config.py`).

### Типовые security-ошибки
- Просроченная сессия (`verify_session_token()` возвращает `None`).
- Подмена payload/signature (HMAC mismatch).
- Отсутствие CSRF header при `POST/PATCH/DELETE`.
- Неверные cookie path/secure флаги в окружении (`GW_SESSION_COOKIE_*`, `GW_CSRF_COOKIE_*`).

## Что подтверждают тесты
- `gateway_py/tests/test_auth_csrf.py`:
  - mismatch CSRF даёт `403 csrf_required`;
  - login/register happy-path;
  - корректность `content-length` ответа;
  - маппинг gRPC INVALID_ARGUMENT → `400 validation_error`.
- `gateway_py/tests/test_session_security.py`:
  - property-like roundtrip выдачи/проверки токена;
  - reject expired token;
  - reject tampered token.
- `gateway_py/tests/test_session_security.py` + `gateway_py/tests/test_auth_csrf.py` покрывают критичный контур session/csrf безопасности.
