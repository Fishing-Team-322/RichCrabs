# auth service — overview

## Назначение
Сервис аутентификации и профилей пользователей. Экспортирует gRPC API для регистрации, входа, профиля и админ-операций.

## Ключевые файлы
- `richcrab/services/auth/src/main.rs`
- `richcrab/services/auth/src/service.rs`
- `richcrab/services/auth/src/repository.rs`

## Контракты и зависимости
### Межсервисные контракты
- richcrab.v1.AuthService (proto/auth.proto)

### Внешние зависимости
- Postgres (таблица gateway_users, bcrypt/crypt)
- gRPC server (tonic)
- Prometheus metrics + tracing через shared::observability
