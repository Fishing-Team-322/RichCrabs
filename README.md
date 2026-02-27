# RichCrabs

![alt text](docs/rich_crab.png)

## Быстрый старт

```bash
docker compose up -d --build
```

## Python gateway (FastAPI)

Gateway полностью переведен на Python (`gateway_py/`) и запускается как сервис `gateway` в `docker-compose.yml`.
Старый C++ gateway (`defay1x9/`) больше не используется в runtime flow.

### Проверка

```bash
curl -fsS http://localhost:8080/health
curl -fsS http://localhost:8080/docs | head
```

### Smoke сценарий

```bash
# получить csrf
curl -i http://localhost:8080/csrf

# проверить сессию
curl -i http://localhost:8080/api/v1/session

# создать room (после login/register, с cookie + csrf header)
curl -i -X POST http://localhost:8080/api/v1/games \
  -H 'Content-Type: application/json' \
  -H 'X-XSRF-TOKEN: <csrf>' \
  -b 'QB-SESSION=<session>; XSRF-TOKEN=<csrf>' \
  -d '{"ownerUserId":"<uuid>","quizId":"demo-quiz","title":"Friday Quiz"}'
```

## Когда использовать полный сброс

```bash
docker compose down -v --remove-orphans
```

## CI cache strategy

- Rust jobs (`test`, `load_test`) используют `Swatinem/rust-cache@v2` с ключом, привязанным к `richcrab/Cargo.lock` и версии toolchain (`stable`).
- Python job (`gateway_py`) использует `actions/setup-python@v5` с `cache: pip` и `cache-dependency-path: gateway_py/requirements*.txt`.
- Frontend job (`frontend`) использует `actions/setup-node@v4` с `cache: npm` и `cache-dependency-path: frontend/package-lock.json`.
- `sqlx-cli` в CI ставится через prebuilt action (`taiki-e/install-action@v2`), чтобы не компилировать бинарь при каждом прогоне.
