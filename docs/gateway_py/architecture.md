# Gateway Python: архитектура

## Слои

1. **Router layer** — FastAPI роутеры принимают HTTP запросы.
2. **Dependency layer** — общие проверки (сессии, csrf).
3. **Service/mapping layer** — нормализация запросов/ответов.
4. **gRPC client layer** — вызовы Rust-сервисов.

## Архитектурные принципы

- Тонкий gateway: без тяжелой бизнес-логики.
- Явная доменная сегментация роутеров (`auth`, `games`, `quizzes` и т.д.).
- Единая точка конфигурации через `app/config.py`.
- Backpressure и таймауты делегируются transport/client уровню.

## Поток запроса

`HTTP -> router -> dependencies -> service -> gRPC -> mapping -> HTTP response`

## Надежность

- Health endpoint для readiness/liveness.
- Стандартизированные коды ошибок для клиентских сценариев.
