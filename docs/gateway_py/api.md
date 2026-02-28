# Gateway Python: API

## Основные группы endpoint-ов

- `system` — сервисные и health endpoint-ы.
- `auth` — регистрация/логин/сессии.
- `profile` — операции профиля пользователя.
- `games` — комнаты и игровой lifecycle.
- `quizzes` — CRUD и публикация квизов.
- `bots` — Telegram/bot интеграция.
- `billing` — подписки и платежные операции.
- `admin` — административные методы.
- `ws` — realtime endpoint-ы.

## Версионирование

- Основной API префикс: `/api/v1/...`.

## Документирование

- Swagger UI: `/docs`
- OpenAPI schema: `/openapi.json`

## Контрактные ожидания

- Cookie-based session в сочетании с CSRF токеном для state-changing операций.
- JSON payload/request-response формат для REST маршрутов.
