# entitlements service — transport and infrastructure

## Transport слой
- См. `main.rs` и transport-модули сервиса для настройки endpoint-ов и middleware.
- Health endpoint: gRPC health для tonic-сервисов, либо `/health` для HTTP ingress.

## Infrastructure слой
- Data access: `repository.rs` и/или инфраструктурные адаптеры.
- Runtime integrations: Redis/Postgres/gRPC/HTTP клиенты в зависимости от сервиса.

## Контракты
- Источник истины по API: `richcrab/proto/proto/auth.proto`, `game.proto`, `quiz.proto`, `join.proto`, `bot.proto`, `entitlements.proto`, `common.proto`.
- Для bot_ingress/bot_runner дополнительно используется внутренний контракт Redis Stream (`bot_id`, `update_id`, `payload`, `enqueued_at_ms`, `attempt`).

## Межсервисные вызовы
- game -> entitlements (quota checks/report usage), game -> quiz (fetch/published quiz).
- bot -> entitlements (quota checks/report usage).
- bot_runner -> game (CreateRoom и данные приглашения).
- join использует Redis-ключи, записанные game сервисом (PIN/invite mapping).
