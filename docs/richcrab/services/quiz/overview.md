# quiz service — overview

## Назначение
Сервис управления квизами (CRUD, публикации) и AI-генерации квизов.

## Ключевые файлы
- `richcrab/services/quiz/src/main.rs`
- `richcrab/services/quiz/src/service.rs`
- `richcrab/services/quiz/src/repository.rs`
- `richcrab/services/quiz/src/application/*`
- `richcrab/services/quiz/src/infrastructure/*`
- `richcrab/services/quiz/src/config/ai.rs`
- `richcrab/services/quiz/src/mappers.rs`

## Контракты и зависимости
### Межсервисные контракты
- richcrab.v1.QuizService (proto/quiz.proto)

### Внешние зависимости
- Postgres (quizzes, versions, jobs)
- gRPC server (tonic)
- внешний AI провайдер через infrastructure/ai_provider.rs
- локальный fallback bank JSON
