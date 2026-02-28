# join service — domain and application

## Доменная зона
- Основная ответственность: Сервис выдачи join-ticket по PIN/Invite. Работает как анти-абьюз входная точка в игровые комнаты.
- Границы сервиса определяются контрактами в `richcrab/proto/proto/*.proto` и локальными моделями.

## Прикладные сценарии
- Happy path: валидировать вход, выполнить доменную операцию, вернуть gRPC/HTTP ответ.
- Error path: маппинг инфраструктурных ошибок в `tonic::Status` или HTTP status.

## Карта слоев
- application/domain: в service.rs (ticket model, rate limits)
- transport: tonic gRPC handler in service.rs
- infrastructure: RedisClient через shared

## Ключевые файлы и роль
- `main.rs`: wiring зависимостей, env-конфиг, запуск сервера/цикла.
- `service.rs`: orchestrator бизнес-сценариев и маппинг ошибок (если файл присутствует).
- `repository.rs`: доступ к данным/хранилищам (если файл присутствует).
