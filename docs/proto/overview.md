# Proto: обзор

Каталог `richcrab/proto/` отвечает за protobuf-схемы и генерацию Rust типов для gRPC.

## Что входит

- `.proto` файлы в `richcrab/proto/proto/`
- build-script `build.rs`
- crate `proto` для общего использования в сервисах

## Зачем это нужно

- Единый source of truth для межсервисных контрактов.
- Типобезопасные клиенты/серверы через `tonic`.
