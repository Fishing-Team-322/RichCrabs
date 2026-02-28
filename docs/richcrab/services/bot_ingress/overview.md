# bot_ingress service — overview

## Назначение
HTTP ingress для Telegram webhook, валидирует секрет и складывает обновления в Redis Streams для bot_runner.

## Ключевые файлы
- `richcrab/services/bot_ingress/src/main.rs`
- `richcrab/services/bot_ingress/src/repository.rs`

## Контракты и зависимости
### Межсервисные контракты
- HTTP: POST /api/v1/telegram/webhook/:bot_id/:webhook_secret
- internal queue contract: Redis Stream fields bot_id/update_id/payload/enqueued_at_ms/attempt

### Внешние зависимости
- Postgres (поиск bot webhook_secret)
- Redis Streams (XADD)
- Axum HTTP server
- Prometheus metrics
