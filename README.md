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
