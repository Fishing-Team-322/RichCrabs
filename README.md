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

## Локальные проверки frontend (как в CI)

```bash
cd frontend
npm ci

# опционально: выполнится только если script lint добавлен
npm run lint

# обязательные fail-fast проверки
npm run typecheck
npm run test
npm run build
```

`npm run typecheck` и `npm run test` запускаются последовательно и должны завершаться успешно перед сборкой. Тесты формируют отчеты покрытия в `frontend/coverage`, сборка — артефакт в `frontend/dist`.
