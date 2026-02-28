# bot service — domain and application

## Доменная зона
- Основная ответственность: Сервис регистрации Telegram-ботов, управления статусом и выдачи operational статусов.
- Границы сервиса определяются контрактами в `richcrab/proto/proto/*.proto` и локальными моделями.

## Прикладные сценарии
- Happy path: валидировать вход, выполнить доменную операцию, вернуть gRPC/HTTP ответ.
- Error path: маппинг инфраструктурных ошибок в `tonic::Status` или HTTP status.

## Карта слоев
- application/: bot_management + typed errors
- transport/: authz + grpc_service (интерфейс gRPC)
- infrastructure/: entitlements_guard
- providers/: telegram_client и ошибки
- security/: token_crypto

## Ключевые файлы и роль
- `main.rs`: wiring зависимостей, env-конфиг, запуск сервера/цикла.
- `service.rs`: orchestrator бизнес-сценариев и маппинг ошибок (если файл присутствует).
- `repository.rs`: доступ к данным/хранилищам (если файл присутствует).
