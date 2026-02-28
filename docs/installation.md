# Установка и запуск RichCrabs

Документ описывает два основных сценария запуска:

1. локально (отдельный запуск инфраструктуры и сервисов);
2. через `docker compose` (рекомендуемый способ для быстрого старта).

## 1. Требования окружения

### Базовые инструменты

- Docker + Docker Compose v2;
- Git;
- `curl` для smoke/health проверок.

### Для локального запуска без контейнеров

- Rust toolchain (stable);
- Python 3.11+ и `pip`;
- Node.js 18+ и `npm`;
- PostgreSQL 16+;
- Redis 7+.

## 2. Быстрый старт через Docker Compose (рекомендуется)

### Шаг 1. Поднять все сервисы

```bash
docker compose up -d --build
```

### Шаг 2. Проверить gateway health

```bash
curl -fsS http://localhost:8080/health
```

Ожидается успешный ответ (HTTP 200).

### Шаг 3. Проверить доступность OpenAPI UI

```bash
curl -fsS http://localhost:8080/docs | head
```

### Шаг 4. Проверить frontend

Откройте в браузере:

- `http://localhost:5173` — frontend;
- `http://localhost:8080/docs` — gateway Swagger UI.

### Полный сброс окружения

```bash
docker compose down -v --remove-orphans
```

Используйте при необходимости чистого старта базы/кеша.

## 3. Локальный запуск (без полного docker compose)

Ниже минимальный сценарий для разработки, когда инфраструктура и сервисы запускаются вручную.

### Шаг 1. Поднять Postgres и Redis

Вариант через Docker (только инфраструктура):

```bash
docker run --name richcrab-pg -e POSTGRES_DB=richcrab -e POSTGRES_USER=richcrab -e POSTGRES_PASSWORD=richcrab -p 5432:5432 -d postgres:16-alpine
docker run --name richcrab-redis -p 6379:6379 -d redis:7-alpine
```

### Шаг 2. Запустить Rust gRPC сервисы

Из каталога `richcrab/` (в отдельных терминалах):

```bash
cargo run -p entitlements
cargo run -p auth
cargo run -p game
cargo run -p join
cargo run -p quiz
cargo run -p bot
cargo run -p bot_ingress
cargo run -p bot_runner
```

Минимально для gateway обычно достаточно `game`, `join`, `quiz`, `entitlements`, `bot`, `auth`.

### Шаг 3. Запустить Python gateway

```bash
cd gateway_py
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8080
```

### Шаг 4. Запустить frontend

```bash
cd frontend
npm ci
npm run dev
```

По умолчанию Vite поднимет UI на `http://localhost:5173`.

## 4. Переменные окружения (минимум)

### Gateway

- `GW_GRPC_GAME_ADDR`
- `GW_GRPC_JOIN_ADDR`
- `GW_GRPC_QUIZ_ADDR`
- `GW_GRPC_ENTITLEMENTS_ADDR`
- `GW_GRPC_BOT_ADDR`
- `GW_GRPC_AUTH_ADDR`
- `GW_REDIS_URL`
- `GW_SESSION_SIGNING_KEY`

### Rust сервисы

- `DATABASE_URL`
- `REDIS_URL`
- `ENCRYPTION_KEY`
- `SERVICE_ADDR_*`
- `MIGRATIONS_DIR`

## 5. Health-check и базовая smoke-проверка

### Gateway health endpoint

```bash
curl -i http://localhost:8080/health
```

Ожидается `HTTP/1.1 200 OK`.

### Базовый session/check flow

```bash
curl -i http://localhost:8080/csrf
curl -i http://localhost:8080/api/v1/session
```

## 6. Типовые проблемы

- `connection refused` к gRPC — проверьте, что соответствующий Rust сервис поднят и слушает нужный порт;
- `redis unavailable` — проверьте `GW_REDIS_URL` и состояние Redis;
- ошибки БД при старте сервисов — проверьте `DATABASE_URL` и примененные миграции;
- frontend не видит API — проверьте `VITE_API_BASE_URL` и `VITE_WS_URL`.
