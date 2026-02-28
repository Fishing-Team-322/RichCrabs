# bot service — overview

## Назначение
Сервис регистрации Telegram-ботов, управления статусом и выдачи operational статусов.

## Ключевые файлы
- `richcrab/services/bot/src/main.rs`
- `richcrab/services/bot/src/service.rs`
- `richcrab/services/bot/src/repository.rs`
- `richcrab/services/bot/src/application/*`
- `richcrab/services/bot/src/transport/*`
- `richcrab/services/bot/src/infrastructure/*`
- `richcrab/services/bot/src/providers/*`
- `richcrab/services/bot/src/security/*`

## Контракты и зависимости
### Межсервисные контракты
- richcrab.v1.BotService (proto/bot.proto)

### Внешние зависимости
- Postgres (bots, bot_status_audit)
- gRPC client to EntitlementsService
- Telegram HTTP API (getMe/setWebhook/deleteWebhook/getWebhookInfo)
- gRPC server (tonic)
