# Gateway Python: overview

`gateway_py/` — edge-слой на FastAPI, который связывает frontend и Rust gRPC-сервисы.

## Карта слоёв и ответственности

### 1) Bootstrap и конфигурация
- **Файлы:** `gateway_py/app/main.py`, `gateway_py/app/config.py`.
- **Ответственность слоя:** инициализация `FastAPI`, подключение роутеров, чтение runtime-настроек (адреса gRPC, cookie-параметры, Redis).
- **Ключевые сущности:**
  - `app` + подключение роутеров в `main.py`.
  - `Config`/`settings` и boolean-парсер `_b()` в `config.py`.
- **Сценарий вызова:** старт процесса (`uvicorn app.main:app`) → загрузка `settings` → регистрация всех `APIRouter`.
- **Типовые ошибки:** неверные `GW_*` переменные (например, невалидный `GW_GRPC_*` адрес), некорректный путь `GW_OPENAPI_PATH`.
- **HTTP/WS flow:**
  1. Клиент идёт в REST `/api/v1/...` или WS `/ws`.
  2. Запрос маршрутизируется через подключённый роутер.

### 2) Безопасность сессий
- **Файл:** `gateway_py/app/security.py`.
- **Ответственность слоя:** выпуск/проверка signed session token, генерация CSRF token, установка cookie.
- **Ключевые сущности:** `SessionClaims`, `issue_session_token()`, `verify_session_token()`, `issue_csrf_token()`, `set_auth()`.
- **Сценарий вызова:** login/register/create/join вызывают `set_auth()` и получают session + csrf cookie.
- **Типовые ошибки:**
  - истёкший токен (`exp` в прошлом),
  - tampered token (не совпал HMAC),
  - несовпадение CSRF cookie/header в state-changing запросе.
- **HTTP/WS flow:**
  1. `POST /api/v1/auth/login` возвращает user + ставит cookies.
  2. Последующий `GET /api/v1/session` валидирует cookie через `verify_session_token()`.
  3. `GET /ws` использует cookie или `joinTicket` query param для авторизации WS-сессии.

### 3) API-маршрутизация
- **Файлы:** `gateway_py/app/api/routers/*.py`, `gateway_py/app/api/dependencies/*.py`.
- **Ответственность слоя:** HTTP/WS endpoints, auth/csrf guard, трансляция ошибок gRPC.
- **Ключевые маршруты:**
  - system: `/health`, `/api/v1/healthz`, `/openapi.yaml`;
  - auth: `/api/v1/auth/login`, `/api/v1/auth/register`, `/api/v1/auth/logout`, `/api/v1/session`, `/csrf`;
  - games/quizzes/bots/billing/profile/admin + websocket `/ws`.
- **Сценарий вызова:** роутер → `require_user()`/`require_csrf()` → gRPC-клиент/сервис → JSON-ответ.
- **Типовые ошибки:** `401 unauthorized`, `403 csrf_required|forbidden`, `404 not_found`, mapped gRPC validation/internal.
- **HTTP/WS flow:**
  1. Host создаёт игру (`POST /api/v1/games`).
  2. Player заходит по PIN/invite (`POST /api/v1/games/{pin}/join`).
  3. WS клиент подключается к `/ws`, получает `hello`, затем `room_event`/`room_state`.

### 4) Сервисы и мапперы
- **Файлы:** `gateway_py/app/services/*.py`, `gateway_py/app/mappers/*.py`.
- **Ответственность слоя:** thin-orchestration, преобразование protobuf/внутренних данных в стабильный JSON.
- **Ключевые сущности:**
  - services: `list_rooms()`, `resolve_host_room()`, `list_quizzes()`, `checkout()`, `store_binding()`;
  - mappers: `map_room_snapshot()`, `quiz_to_json()`, `room_event_to_dict()`.
- **Сценарий вызова:** роутер обращается к сервису; сервис тянет данные из gRPC/Redis; mapper нормализует структуру.
- **Типовые ошибки:** несовместимость protobuf-поля, повреждённый JSON в Redis, пустые nullable-поля.

### 5) Тестовый слой
- **Файлы:** `gateway_py/tests/*.py`.
- **Ответственность слоя:** контрактная проверка REST/WS endpoint-ов, CSRF/session, mapping gRPC ошибок.
- **Ключевые проверки:** `test_auth_csrf.py`, `test_session_security.py`, `test_ws_api.py`, `test_system_api.py`.
- **Сценарий вызова:** `pytest` поднимает тестовый клиент FastAPI + fake gRPC clients.
- **Типовые ошибки:** невалидные cookie/headers, рассинхрон content-length/body, неконсистентный формат WS-error payload.
