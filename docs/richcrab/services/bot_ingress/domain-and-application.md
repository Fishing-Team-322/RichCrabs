# bot_ingress service — domain and application

## Доменная зона
- Основная ответственность: HTTP ingress для Telegram webhook, валидирует секрет и складывает обновления в Redis Streams для bot_runner.
- Границы сервиса определяются контрактами в `richcrab/proto/proto/*.proto` и локальными моделями.

## Прикладные сценарии
- Happy path: валидировать вход, выполнить доменную операцию, вернуть gRPC/HTTP ответ.
- Error path: маппинг инфраструктурных ошибок в `tonic::Status` или HTTP status.

## Карта слоев
- transport: axum router + middleware guard
- application: enqueue/validation flow в main.rs
- infrastructure: repository.rs + redis commands

## Ключевые файлы и роль
- `main.rs`: wiring зависимостей, env-конфиг, запуск сервера/цикла.
- `service.rs`: orchestrator бизнес-сценариев и маппинг ошибок (если файл присутствует).
- `repository.rs`: доступ к данным/хранилищам (если файл присутствует).
