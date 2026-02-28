# Gateway Python: обзор

`gateway_py/` — HTTP/WS edge-слой проекта на FastAPI.

## Ответственность

- Экспонирует REST API для frontend/клиентов.
- Выполняет авторизацию, session/csrf-проверки и базовые policy.
- Проксирует бизнес-операции в Rust gRPC сервисы.
- Предоставляет health/system endpoints.

## Ключевые части

- `app/main.py` — bootstrap FastAPI и подключение роутеров.
- `app/api/routers/*` — группировка endpoint-ов по доменам.
- `app/api/dependencies/*` — auth/csrf зависимости.
- `app/grpc_clients/*` — gRPC клиенты к backend.
- `app/services/*` — thin service-слой orchestration.

## Входные интерфейсы

- HTTP API (`/api/v1/...`)
- health (`/health`)
- OpenAPI (`/docs`, `/openapi.json`)
