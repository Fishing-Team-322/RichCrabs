# entitlements service — domain and application

## Доменная зона
- Основная ответственность: Сервис тарифов и лимитов: check_entitlement + report_usage на основе плана и counters.
- Границы сервиса определяются контрактами в `richcrab/proto/proto/*.proto` и локальными моделями.

## Прикладные сценарии
- Happy path: валидировать вход, выполнить доменную операцию, вернуть gRPC/HTTP ответ.
- Error path: маппинг инфраструктурных ошибок в `tonic::Status` или HTTP status.

## Карта слоев
- application: правила feature→quota/usage mapping в service.rs
- infrastructure: repositories Plan/User/UsageCounter
- transport: gRPC trait implementation

## Ключевые файлы и роль
- `main.rs`: wiring зависимостей, env-конфиг, запуск сервера/цикла.
- `service.rs`: orchestrator бизнес-сценариев и маппинг ошибок (если файл присутствует).
- `repository.rs`: доступ к данным/хранилищам (если файл присутствует).
