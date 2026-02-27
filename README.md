# RichCrabs

## Быстрый старт

1) Собрать/обновить Linux-бинарь gateway (идемпотентно, инкрементально):

```bash
./scripts/build-gateway-binary.sh
```

Скрипт кладёт артефакты сюда:
- бинарь: `defay1x9/bin/defay1x9`
- runtime-библиотеки: `defay1x9/bin/lib/`

2) Поднять контейнеры:

```bash
docker compose up -d --build
```

## Проверка gateway

```bash
curl -fsS http://localhost:8080/health
```

Если нужен статус контейнера:

```bash
docker compose ps gateway
docker compose logs -f gateway
```

## Когда пересобирать бинарь gateway

Запускайте `./scripts/build-gateway-binary.sh` перед `docker compose up -d --build`,
особенно после изменений в:
- `defay1x9/src`
- `defay1x9/include`
- `defay1x9/CMakeLists.txt`
- `defay1x9/vcpkg.json`
- `richcrab/proto/proto`

Скрипт использует обычный инкрементальный `cmake --build`, поэтому без изменений
лишней полной пересборки не будет.

## Когда использовать полный сброс

Полный сброс окружения нужен только при действительно сломанном состоянии:

```bash
docker compose down -v --remove-orphans
```

## Запуск фронтенда

```bash
cd frontend
npm ci
npm run dev
```

Frontend будет доступен на `http://localhost:5173`.
