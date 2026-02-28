# Gateway Python: testing and troubleshooting

## Test layer (`gateway_py/tests/*.py`)

### Ответственность
- Проверять контракт API без поднятия реальных backend сервисов.
- Подтверждать security-инварианты (session/csrf), системные endpoint-ы и websocket-сценарии.

### Ключевые тестовые файлы
- `test_auth_csrf.py` — CSRF mismatch, login/register сценарии, gRPC error mapping.
- `test_session_security.py` — roundtrip/expiry/tampering session token.
- `test_system_api.py` — `/api/v1/healthz` и guest session поведение.
- `test_ws_api.py` — hello/ping/get_state/error и обработка stream failure.
- Остальные API-контракты: `test_games_api.py`, `test_quizzes_api.py`, `test_bots_api.py`, `test_billing_api.py`, `test_profile_api.py`, `test_admin_api.py`.

### Базовые команды
```bash
cd gateway_py
pytest
```

```bash
cd gateway_py
pytest tests/test_auth_csrf.py tests/test_session_security.py tests/test_system_api.py tests/test_ws_api.py -q
```

## Эксплуатация и health-check

### Health-check
- Основные endpoint-ы:
  - `GET /health`
  - `GET /api/v1/healthz`
- Расширенная проверка зависимостей:
  - `GET /health?grpc_check=true` вызывает `clients.health.Ping(...)`.
  - При недоступности gRPC статус деградирует до `503` c `{"dependencies":{"rust_grpc":"down"}}`.

### Конфигурация, которую проверяем первой
- `gateway_py/app/config.py`:
  - сетевые: `GW_LISTEN_HOST`, `GW_LISTEN_PORT`, `GW_PUBLIC_BASE_URL`;
  - gRPC: `GW_GRPC_GAME_ADDR`, `GW_GRPC_JOIN_ADDR`, `GW_GRPC_QUIZ_ADDR`, `GW_GRPC_ENTITLEMENTS_ADDR`, `GW_GRPC_BOT_ADDR`, `GW_GRPC_AUTH_ADDR`;
  - Redis: `GW_REDIS_URL`;
  - session/csrf cookie: `GW_SESSION_*`, `GW_CSRF_*`;
  - schema path: `GW_OPENAPI_PATH`.

### Типовые проблемы конфигурации
- Неправильный `GW_PUBLIC_BASE_URL` → frontend получает некорректный `wsUrl`.
- `GW_SESSION_COOKIE_SECURE=true` в HTTP-dev окружении → cookie не устанавливаются в браузере.
- Несовпадение `GW_CSRF_HEADER_NAME` с тем, что отправляет frontend → массовые `403 csrf_required`.
- Неверный `GW_REDIS_URL` → ошибки billing/bot binding.

## Диагностика логов и инцидентов

### Практический runbook
1. Проверить `GET /api/v1/healthz`.
2. Проверить `GET /health?grpc_check=true`.
3. Сделать login flow: `/api/v1/auth/csrf` → `/api/v1/auth/login` и убедиться, что приходят обе cookie.
4. Проверить state-changing запрос с CSRF header (например, `POST /api/v1/games`).
5. Проверить Redis операции для billing/bot (подписка, история, binding).
6. Для realtime — открыть `/ws`, дождаться `hello`, отправить `ping`.

### Что искать в логах
- Серии `401 unauthorized` — обычно отсутствует/битая session cookie.
- Серии `403 csrf_required` — mismatch cookie/header либо потеря cookie path/domain.
- Ошибки gRPC в router-слое — признак проблем backend service или несовместимости protobuf.
- Ошибки Redis client — проблемы сети/аутентификации Redis.
