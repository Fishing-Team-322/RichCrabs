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

Для ежедневной разработки это обычно не требуется.
