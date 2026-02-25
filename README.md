# RichCrabs

## Быстрый старт через Docker Compose

Проект теперь можно поднять командой без дополнительной ручной настройки:

```bash
docker compose up --build
```

Что происходит автоматически:
- собирается отдельный Docker-образ для Rust-бэкенда (`docker/rust-backend.Dockerfile`), где уже есть `cargo`, `protoc` и системные зависимости;
- Postgres при первом старте прогоняет SQL-миграции из `richcrab/migrations`;
- после миграций выполняется сидинг (`docker/postgres-init/10-seed.sql`).

## Переменные окружения

Compose уже содержит безопасные значения по умолчанию, поэтому `git clone && docker compose up --build` работает из коробки.

Если хочешь переопределить параметры:

```bash
cp .env.example .env
# при необходимости меняешь значения
```

Файл `.env.example` полностью runtime-ready для локального запуска.

## Полезные команды

```bash
# запустить в фоне
docker compose up -d --build

# посмотреть логи
docker compose logs -f

# остановить
docker compose down
```
