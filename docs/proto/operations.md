# Proto: операции

## Регенерация и проверка

При изменении `.proto` файлов:

```bash
cd richcrab
cargo check -p proto
cargo check --workspace
```

Для Python gateway используйте скрипт:

```bash
cd gateway_py
./scripts/gen_proto.sh
```

## Контроль совместимости

- Перед merge проверяйте, что клиенты/серверы успешно компилируются.
- При добавлении RPC обновляйте документацию в `docs/*/api.md`.
