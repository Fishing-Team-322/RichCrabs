# Proto: API и версии

## Namespace

- `richcrab.v1` — основной продуктовый контракт.
- `gigachat.v1` — контракт AI-интеграции.

## Эволюция контрактов

- Добавляйте новые поля как optional/nullable, не удаляя старые.
- Не переиспользуйте идентификаторы полей.
- Для breaking changes создавайте новый versioned namespace.

## Потребители

- Все Rust сервисы workspace.
- Python gateway через сгенерированные gRPC артефакты.
