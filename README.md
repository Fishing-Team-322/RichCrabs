# RichCrabs

## Быстрый старт через Docker Compose

Минимальный сценарий запуска:

```bash
docker compose up
```

Что происходит автоматически:
- Rust-сервисы поднимаются из локально собранного образа `richcrabs/rust-backend:local` (Compose принудительно использует `pull_policy: build`), поэтому `cargo` и `protoc` всегда доступны в рантайме;
- Postgres на первой инициализации применяет миграции из `richcrab/migrations`;
- после миграций выполняется сидинг (`docker/postgres-init/10-seed.sql`).

## Переменные окружения

Значения по умолчанию уже достаточны для локального рантайма (`git clone && docker compose up`).

Если нужно переопределить:

```bash
cp .env.example .env
# при необходимости меняешь значения
```

`.env.example` уже содержит рабочий runtime-конфиг.

## Если раньше запуск уже падал

Если у тебя остался частично инициализированный том Postgres от неудачного старта, первый успешный запуск может блокироваться старым состоянием БД. Сбрось тома один раз:

```bash
docker compose down -v
docker compose up
```

## Полезные команды

```bash
# запустить в фоне
docker compose up -d

# посмотреть логи
docker compose logs -f

# остановить
docker compose down
```

## Запуск фронтенда (обновляйте этот раздел при изменениях)

```bash
cd frontend
npm ci
npm run dev
```

Frontend будет доступен на `http://localhost:5173`.

Дополнительно:

```bash
# production build
cd frontend
npm run build

# локальный предпросмотр production-сборки
npm run preview
```

Проверки качества фронтенда локально:

```bash
cd frontend
npm ci

# линтер выполняется только если добавлен script lint
npm run lint --if-present

# fail-fast: остановится на первой ошибке типов или тестов
npm run typecheck && npm run test:coverage && npm run build
```

После `npm run test:coverage` отчёт покрытия будет доступен в `frontend/coverage`.
