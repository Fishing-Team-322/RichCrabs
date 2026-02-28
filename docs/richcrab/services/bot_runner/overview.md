# bot_runner service — overview

## Назначение
Воркер обработки Telegram updates из Redis Streams, выполняет команды и дергает GameService.

## Ключевые файлы
- `richcrab/services/bot_runner/src/main.rs`
- `richcrab/services/bot_runner/src/repository.rs`

## Контракты и зависимости
### Межсервисные контракты
- internal queue contract: consumer group over Redis Streams
- gRPC client: richcrab.v1.GameService CreateRoom

### Внешние зависимости
- Postgres (lookup bot token/user)
- Redis Streams + idempotency/dlq keys
- Telegram HTTP API sendMessage
- gRPC client to game
