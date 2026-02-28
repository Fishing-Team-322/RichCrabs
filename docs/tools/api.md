# Tools: интерфейсы

## `smoke_load` переменные окружения

- `SERVICE_ADDR_GAME` (default: `http://127.0.0.1:50051`)
- `SERVICE_ADDR_JOIN` (default: `http://127.0.0.1:50052`)
- `SMOKE_PLAYERS` (default: `10`)

## Выход

- Лог успешного завершения вида:
  - `smoke-load complete players=<N> room_id=<ID>`

## Ограничения

- Утилита не заменяет полноценных интеграционных/нагрузочных тестов.
