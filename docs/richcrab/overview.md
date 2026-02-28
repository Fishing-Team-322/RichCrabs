# Richcrab workspace: обзор

`richcrab/` — Rust workspace с gRPC сервисами доменной логики.

## Состав

- `services/game`
- `services/join`
- `services/quiz`
- `services/entitlements`
- `services/bot`
- `services/bot_ingress`
- `services/bot_runner`
- `services/auth`
- `shared`
- `proto`
- `tools/smoke_load`

## Роль в системе

- Выполняет основную бизнес-логику.
- Работает с PostgreSQL и Redis.
- Публикует gRPC контракты для gateway и внутренних клиентов.
