# Richcrab workspace: операции

## Локальный запуск сервиса

Пример:

```bash
cd richcrab
cargo run -p game
```

## Проверка сборки workspace

```bash
cd richcrab
cargo check --workspace
```

## Интеграционные проверки

- В репозитории есть integration tests для ключевых сервисов.
- Для smoke/load сценариев используйте `tools/smoke_load`.

## Эксплуатационные заметки

- Следите за валидностью `DATABASE_URL`, `REDIS_URL`, `SERVICE_ADDR_*`.
- Миграции должны применяться перед production rollout.
