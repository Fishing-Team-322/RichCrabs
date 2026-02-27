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


## Почему сборка `gateway` может идти 15–60+ минут

Основная причина в том, что ты каждый цикл разработки запускаешь полную пересборку без кеша:

```bash
docker compose down -v --remove-orphans
docker compose build --no-cache gateway
docker compose up --build -d
```

- `down -v` удаляет тома БД (лишняя тяжёлая операция для обычной итерации);
- `--no-cache` отключает Docker layer cache и вынуждает заново проходить тяжёлые стадии (apt/vcpkg/cmake);
- в C++-части это особенно дорого из-за сборки зависимостей (`drogon`, `grpc`, `protobuf`, `openssl`) через `vcpkg`.

### Быстрый сценарий для daily-dev

```bash
scripts/dev-fast-rebuild.sh
```

Скрипт оставляет кеши сборки включёнными и пересобирает только `gateway`.

### Когда использовать полный сброс

Полный сброс нужен только при действительно сломанном состоянии окружения:

```bash
docker compose down -v --remove-orphans
```

Делать это перед *каждым* изменением не нужно.

## Полезные команды

```bash
# запустить в фоне
docker compose up -d

# посмотреть логи
docker compose logs -f

# остановить
docker compose down
```
