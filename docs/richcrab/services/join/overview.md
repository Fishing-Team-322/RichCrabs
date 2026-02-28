# join service — overview

## Назначение
Сервис выдачи join-ticket по PIN/Invite. Работает как анти-абьюз входная точка в игровые комнаты.

## Ключевые файлы
- `richcrab/services/join/src/main.rs`
- `richcrab/services/join/src/service.rs`
- `richcrab/services/join/src/repository.rs`

## Контракты и зависимости
### Межсервисные контракты
- richcrab.v1.JoinService (proto/join.proto)

### Внешние зависимости
- Redis (lookup room keys, ticket storage TTL, rate limits)
- gRPC server (tonic)
