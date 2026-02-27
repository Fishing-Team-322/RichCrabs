# Ускорение Docker-сборки C++ gateway (vcpkg)

## Короткий ответ

Да, ускорить в 2–3 раза и больше реально.
На практике самый сильный эффект даёт не смена менеджера пакетов, а правильная архитектура сборки:

1. отдельный deps-image с `vcpkg`;
2. публикация deps-image в registry;
3. обычные rebuild'ы только для кода приложения.

## Почему «так долго»

- `grpc`/`protobuf`/`drogon` — тяжёлые C++ порты, компиляция дорогая;
- `--no-cache` каждый раз убивает кэш слоёв;
- на новых машинах локально компилируется весь dependency-стек с нуля.

## Рабочая стратегия

### A. deps-image (локально)

```bash
docker compose --profile build build gateway_deps
```

### B. deps-image (общий для команды)

```bash
GATEWAY_DEPS_IMAGE=ghcr.io/<org>/richcrabs-gateway-deps:latest \
  scripts/publish-gateway-deps.sh
```

### C. daily-dev

```bash
export GATEWAY_DEPS_IMAGE=ghcr.io/<org>/richcrabs-gateway-deps:latest
scripts/dev-fast-rebuild.sh
```

## Нужно ли «скачать библиотеки в git руками»?

Обычно **нет**.

Минусы хранения бинарных библиотек в Git:
- репозиторий быстро раздувается;
- сложнее обновления и rollback;
- проблемы с платформенной совместимостью и ABI.

Гораздо лучше хранить готовые зависимости как Docker image в registry.

## Стоит ли заменить vcpkg на Conan/apt?

- **Conan 2** может дать быстрый бинарный remote cache, но миграция нетривиальна.
- **apt-only** обычно быстрее в установке, но хуже воспроизводимость и версии могут не совпадать.

Для этого проекта выгоднее оставить `vcpkg`, но убрать повторную пересборку зависимостей.
