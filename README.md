# RichCrabs

![alt text](docs/rich_crab.png)

## Быстрый старт

```bash
docker compose up -d --build
```

## Проверка gateway

```bash
curl -fsS http://localhost:8080/health
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
