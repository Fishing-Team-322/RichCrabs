# entitlements service — overview

## Назначение
Сервис тарифов и лимитов: check_entitlement + report_usage на основе плана и counters.

## Ключевые файлы
- `richcrab/services/entitlements/src/main.rs`
- `richcrab/services/entitlements/src/service.rs`
- `richcrab/services/entitlements/src/repository.rs`

## Контракты и зависимости
### Межсервисные контракты
- richcrab.v1.EntitlementsService (proto/entitlements.proto)

### Внешние зависимости
- Postgres (plans, users, usage_counters)
- Redis (plan/usage cache TTL)
- gRPC server (tonic)
