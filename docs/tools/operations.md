# Tools: операции

## Запуск smoke_load

```bash
cd richcrab
cargo run -p smoke_load
```

## Запуск с параметрами

```bash
cd richcrab
SERVICE_ADDR_GAME=http://127.0.0.1:50051 \
SERVICE_ADDR_JOIN=http://127.0.0.1:50052 \
SMOKE_PLAYERS=50 \
cargo run -p smoke_load
```

## Runbook при падениях

1. Проверить доступность gRPC портов game/join.
2. Проверить health и логи сервисов.
3. Снизить `SMOKE_PLAYERS` и повторить прогон.
