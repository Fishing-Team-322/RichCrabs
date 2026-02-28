# Richcrab workspace: сервисные API

## Транспорт

- Основной протокол взаимодействия: gRPC (`tonic`).
- Контракты определяются protobuf схемами в `richcrab/proto/proto`.

## Сервисы и порты по умолчанию

- `game` — `50051`
- `join` — `50052`
- `quiz` — `50053`
- `entitlements` — `50054`
- `bot` — `50055`
- `auth` — `50056`
- `bot_ingress` — `8090` (HTTP ingress)

## Ожидания по совместимости

- Изменения protobuf должны быть backward-compatible для существующих клиентов.
- Для breaking изменений требуется coordinated rollout gateway + сервисов.
