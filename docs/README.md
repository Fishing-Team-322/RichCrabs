# Документация RichCrabs

Этот каталог содержит централизованную техническую документацию по всем ключевым модулям проекта.

## Быстрая навигация

- [Установка и запуск](./installation.md) — локальный запуск, запуск через Docker Compose, проверка health endpoint.
- [Gateway (Python/FastAPI)](./gateway_py/overview.md)
- [Frontend (Vite + React)](./frontend/overview.md)
- [Backend workspace (Rust services)](./richcrab/overview.md)
- [Proto-контракты (gRPC)](./proto/overview.md)
- [Shared библиотека (Rust)](./shared/overview.md)
- [Инструменты и утилиты](./tools/overview.md)

## Карта разделов

### 1) Gateway (`docs/gateway_py/`)

- [Обзор](./gateway_py/overview.md)
- [Архитектура](./gateway_py/architecture.md)
- [HTTP API и роутинг](./gateway_py/api.md)
- [Операции и сопровождение](./gateway_py/operations.md)

### 2) Frontend (`docs/frontend/`)

- [Обзор](./frontend/overview.md)
- [Архитектура](./frontend/architecture.md)
- [Интеграции API и realtime](./frontend/api.md)
- [Операции и поддержка](./frontend/operations.md)

### 3) Rust backend workspace (`docs/richcrab/`)

- [Обзор workspace и сервисов](./richcrab/overview.md)
- [Архитектура сервисов](./richcrab/architecture.md)
- [Сервисные контракты и взаимодействия](./richcrab/api.md)
- [Эксплуатация и диагностика](./richcrab/operations.md)

### 4) Proto (`docs/proto/`)

- [Обзор protobuf-слоя](./proto/overview.md)
- [Организация схем](./proto/architecture.md)
- [Контракты и версии](./proto/api.md)
- [Операции: генерация и совместимость](./proto/operations.md)

### 5) Shared (`docs/shared/`)

- [Обзор shared crate](./shared/overview.md)
- [Архитектура общих модулей](./shared/architecture.md)
- [Публичные API/модули](./shared/api.md)
- [Операции и best practices](./shared/operations.md)

### 6) Tools (`docs/tools/`)

- [Обзор инструментов](./tools/overview.md)
- [Архитектура smoke/load tooling](./tools/architecture.md)
- [Интерфейсы и переменные окружения](./tools/api.md)
- [Операции и запуск проверок](./tools/operations.md)

## Принципы сопровождения документации

- Вносите изменения в документацию одновременно с изменениями кода.
- Для новых модулей добавляйте отдельный подпакет в `docs/` и ссылку в это оглавление.
- Для runbook-процедур обновляйте соответствующие `operations.md`.
