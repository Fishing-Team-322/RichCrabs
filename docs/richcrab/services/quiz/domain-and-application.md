# quiz service — domain and application

## Доменная зона
- Основная ответственность: Сервис управления квизами (CRUD, публикации) и AI-генерации квизов.
- Границы сервиса определяются контрактами в `richcrab/proto/proto/*.proto` и локальными моделями.

## Прикладные сценарии
- Happy path: валидировать вход, выполнить доменную операцию, вернуть gRPC/HTTP ответ.
- Error path: маппинг инфраструктурных ошибок в `tonic::Status` или HTTP status.

## Карта слоев
- application/: crud, validation, ai_jobs
- transport/service.rs: реализация gRPC trait
- infrastructure/: ai_provider и fallback_bank
- config/: runtime-конфиг AI

## Ключевые файлы и роль
- `main.rs`: wiring зависимостей, env-конфиг, запуск сервера/цикла.
- `service.rs`: orchestrator бизнес-сценариев и маппинг ошибок (если файл присутствует).
- `repository.rs`: доступ к данным/хранилищам (если файл присутствует).
