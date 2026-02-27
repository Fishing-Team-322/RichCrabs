# Ускорение Docker-сборки C++ gateway (vcpkg)

## Коротко

Для этого репозитория ускорение достигается без отдельного deps-образа:

1. BuildKit включён (`DOCKER_BUILDKIT=1`, `COMPOSE_DOCKER_CLI_BUILD=1`);
2. в `defay1x9/Dockerfile` используются cache mounts для `apt`, `vcpkg` и `ccache`;
3. обычный запуск выполняется через `docker compose up -d --build`;
4. перед `cmake` предварительно прогревается архив `jsoncpp` из `codeload.github.com` с retry, что снижает шанс падения на TLS/прокси-ошибках.

## Рекомендуемый workflow

```bash
export DOCKER_BUILDKIT=1
export COMPOSE_DOCKER_CLI_BUILD=1
docker compose up -d --build
```

Для повторной сборки только `gateway`:

```bash
docker compose build gateway
docker compose up -d gateway
```

## Почему это быстрее

- зависимости `vcpkg` и пакеты `apt` переиспользуют кеш BuildKit между сборками;
- объектные файлы C/C++ переиспользуются через `ccache`;
- редкие падения при скачивании `jsoncpp` с `github.com` обходятся предварительной загрузкой с retry.
- не требуется отдельный профиль/образ зависимостей для обычного запуска.
