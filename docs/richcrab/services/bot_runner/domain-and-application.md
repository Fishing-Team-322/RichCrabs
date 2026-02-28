# bot_runner service — domain and application

## Доменная зона
- Основная ответственность: Воркер обработки Telegram updates из Redis Streams, выполняет команды и дергает GameService.
- Границы сервиса определяются контрактами в `richcrab/proto/proto/*.proto` и локальными моделями.

## Прикладные сценарии
- Happy path: валидировать вход, выполнить доменную операцию, вернуть gRPC/HTTP ответ.
- Error path: маппинг инфраструктурных ошибок в `tonic::Status` или HTTP status.

## Карта слоев
- application: command handling (/create_game, /invite, /pin)
- infrastructure: redis stream consumer/retry/dlq, repo lookup
- transport: нет внешнего server, только фоновые циклы

## Ключевые файлы и роль
- `main.rs`: wiring зависимостей, env-конфиг, запуск сервера/цикла.
- `service.rs`: orchestrator бизнес-сценариев и маппинг ошибок (если файл присутствует).
- `repository.rs`: доступ к данным/хранилищам (если файл присутствует).
