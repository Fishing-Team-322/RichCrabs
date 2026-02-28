# game service — overview

## Назначение
Сервис игровых комнат и игрового цикла. Управляет комнатами, вопросами, ответами, чатом и стримингом событий.

## Ключевые файлы
- `richcrab/services/game/src/main.rs`
- `richcrab/services/game/src/service.rs`
- `richcrab/services/game/src/repository.rs`
- `richcrab/services/game/src/application/*`
- `richcrab/services/game/src/transport/*`
- `richcrab/services/game/src/infrastructure/*`
- `richcrab/services/game/src/room_actor.rs`
- `richcrab/services/game/src/domain.rs`

## Контракты и зависимости
### Межсервисные контракты
- richcrab.v1.GameService (proto/game.proto)
- richcrab.v1.Health (ping)

### Внешние зависимости
- Postgres (чат комнаты через RoomChatRepository)
- Redis (state, pins, ephemeral keys)
- gRPC clients: EntitlementsService и QuizService
- gRPC server (tonic)
