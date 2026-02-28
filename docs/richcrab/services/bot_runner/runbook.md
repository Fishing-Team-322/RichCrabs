# bot_runner service — runbook

## Запуск
- Локально: `cargo run -p bot_runner` (из `richcrab/`).
- Обязательные env-переменные: `DATABASE_URL`/`REDIS_URL`/`SERVICE_ADDR_*`/`ENCRYPTION_KEY` (по профилю сервиса).

## Health checks
- Для tonic-сервисов: gRPC health check (`grpc.health.v1.Health/Check`) + service-specific Ping (если реализован).
- Для `bot_ingress`: `GET /health` и `GET /metrics`.
- Наблюдаемость: prometheus-метрики через `shared::observability::metrics_handler`.

## Типовые сбои
- Недоступен Postgres: ошибки подключения/миграций на старте, SQL timeout в runtime.
- Недоступен Redis: ошибки получения ticket/session/queue, рост latency/lag.
- Недоступен upstream gRPC/HTTP: `Unavailable`, retry/backoff, деградация части сценариев.
- Неверные секреты/ключи (`ENCRYPTION_KEY`, webhook secret): 4xx/ошибки дешифрования.

## Восстановление
1. Проверить env и сетевую связность до Postgres/Redis/upstream gRPC.
2. Проверить миграции (`MIGRATIONS_DIR`) и права БД.
3. Для bot queue: проверить Redis Streams, consumer group, DLQ (`BOT_DLQ_STREAM`).
4. Перезапустить pod/service после устранения внешней причины; проверить health и базовые smoke RPC.

## Метрики и алерты
- Базовые: request count/error rate/latency p95, gRPC status code distribution.
- Очереди (bot_ingress/bot_runner): lag (`queue_lag_seconds`), dead letters (`dead_letter_total`), throughput (`tg_updates_total`).
- Доменные: usage quota rejects (entitlements), room lifecycle failures (game), webhook failures (bot).
