# RichCrabs

![alt text](docs/rich_crab.png)

## Быстрый старт

```bash
docker compose up -d --build
```

Rust-сервисы при старте автоматически применяют SQL-миграции из `/app/richcrab/migrations` (путь задается через `MIGRATIONS_DIR`), поэтому схема актуализируется даже при уже существующем `pg_data` volume.

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
- `sqlx-cli` в `test` job кешируется как `~/.cargo/bin/sqlx` вместе с cargo registry/git cache; установка выполняется только если бинарь отсутствует (например, при смене ключа кеша).

## AI генерация квизов (GigaChat gRPC)

Для генерации квизов через `/api/v1/quizzes/ai-generate` настройте переменные окружения у сервиса `quiz`:

- `GIGACHAT_API_ADDR` — адрес gRPC сервиса (например `host.docker.internal:9000`)
- `GIGACHAT_API_KEY` — API ключ
- `GIGACHAT_MODEL` — модель (по умолчанию `GigaChat-Pro`)

Если `GIGACHAT_API_ADDR`/`GIGACHAT_API_KEY` не заданы, сервис использует fallback-банк вопросов.

### Контракт AI-генерации

Сервис отправляет в модель фиксированный system prompt и шаблон user prompt с параметрами из UI:

- тема;
- язык;
- сложность;
- формат вопроса (`single`/`multi`);
- желаемое число вопросов.

Ожидаемый ответ модели — **только JSON** без markdown и пояснений в формате:

```json
{
  "title": "string",
  "description": "string",
  "questions": [
    {
      "text": "string",
      "options": ["string", "string", "string", "string"],
      "correct_option_index": 0
    }
  ]
}
```

Ограничения на каждый вопрос:

- ровно 4 варианта ответа;
- ровно 1 правильный ответ (`correct_option_index` в диапазоне `0..3`);
- `question.text` не длиннее 160 символов;
- каждый вариант ответа не длиннее 160 символов;
- пустые строки запрещены;
- дубликаты опций запрещены.

Если модель сгенерировала ответ с нарушением ограничений, она должна перегенерировать JSON **внутри того же ответа**, не добавляя объяснений.
