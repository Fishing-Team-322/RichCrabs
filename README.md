# RichCrabs

## Быстрый старт через Docker Compose

Перед сборкой включите BuildKit:

```bash
export DOCKER_BUILDKIT=1
export COMPOSE_DOCKER_CLI_BUILD=1
```

Запуск всех сервисов одной командой:

```bash
docker compose up -d --build
```

## Быстрый цикл разработки

Обычный цикл для изменения кода `gateway`:

```bash
docker compose build gateway
docker compose up -d gateway
```

## Когда использовать полный сброс

Полный сброс окружения нужен только при действительно сломанном состоянии:

```bash
docker compose down -v --remove-orphans
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
