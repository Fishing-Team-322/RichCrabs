# RichCrabs

## Быстрый старт через Docker Compose

```bash
docker compose up
```

## Почему `gateway` может собираться 15–60+ минут

`gateway` — это C++ + `vcpkg` + тяжёлые зависимости (`drogon`, `grpc`, `protobuf`, `openssl`).
Если каждый цикл делать:

```bash
docker compose down -v --remove-orphans
docker compose build --no-cache gateway
docker compose up --build -d
```

получается самый медленный путь:
1. `--no-cache` отключает Docker layer cache;
2. `vcpkg` заново собирает крупные библиотеки;
3. `down -v` стирает полезное состояние среды;
4. `up --build` может затронуть не только `gateway`.

Поэтому `Building 1044.5s` — ожидаемо.

## Что реально ускоряет в 2–3+ раза

### 1) Двухфазная схема: deps-образ отдельно, код отдельно

- `defay1x9/Dockerfile.deps` собирает зависимости **один раз** в `gateway_deps`;
- `defay1x9/Dockerfile` собирает только твой код поверх готовых deps.

```bash
docker compose --profile build build gateway_deps
scripts/dev-fast-rebuild.sh
```

### 2) Расшарить deps-образ через registry (главный буст для других ПК)

Не надо коммитить бинарные библиотеки в Git (это тяжело, ломает репозиторий и плохо версионируется).
Лучше один раз собрать deps-image и пушить в registry:

```bash
GATEWAY_DEPS_IMAGE=ghcr.io/<org>/richcrabs-gateway-deps:latest \
  scripts/publish-gateway-deps.sh
```

На остальных машинах:

```bash
export GATEWAY_DEPS_IMAGE=ghcr.io/<org>/richcrabs-gateway-deps:latest
scripts/dev-fast-rebuild.sh
```

Скрипт сначала попробует `docker pull` deps-образа, и только при отсутствии соберёт локально.

## Когда пересобирать deps-image

Только когда меняются:
- `defay1x9/vcpkg.json`
- `defay1x9/triplets/x64-linux-release.cmake`
- базовая toolchain/ubuntu в `defay1x9/Dockerfile.deps`

## Полный сброс (`down -v`) — только аварийно

```bash
docker compose down -v --remove-orphans
```

Для ежедневной разработки это делать не нужно.
