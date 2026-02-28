# Proto: архитектура схем

## Организация

Схемы разделены по доменам:

- `auth.proto`
- `game.proto`
- `quiz.proto`
- `bot.proto`
- `join.proto`
- `entitlements.proto`
- `events.proto`
- `common.proto`
- агрегирующий `richcrab.proto`

Дополнительно есть `gigachat.proto` для AI-интеграции.

## Генерация

- `build.rs` запускает `tonic-build` на этапе компиляции.
- Сгенерированные типы публикуются через `proto::richcrab::v1` и `proto::gigachat::v1`.
