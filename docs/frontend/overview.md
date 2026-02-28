# Frontend: overview

## Технологический стек

Frontend находится в `frontend/` и использует Vite + React + TypeScript, Redux Toolkit, i18next и Vitest/Playwright для тестов.

## Карта исходников по фактической структуре `frontend/src`

### Ядро архитектуры

- `app/` — composition root приложения:
  - `app/App.tsx` и `app/providers/AppProviders.tsx` собирают провайдеры и bootstrap.
  - `app/providers/i18n.ts` поднимает локализацию и хранение выбранного языка.
  - `app/router/*` содержит route map, lazy pages и guards (`AuthGuard`, `GuestGuard`, `AdminGuard`).
- `pages/` — route-level экраны (join, auth, quizzes, rooms, profile, subscriptions, admin и т.д.).
- `features/` — прикладные функциональные модули (auth, rooms, quizzes, bots, billing, monitoring).
- `entities/` — слой доменных сущностей и базовых моделей.
- `shared/` — кросс-доменный слой: `shared/ui`, `shared/utils`, `shared/api`, `shared/validation`.

### Технические и инфраструктурные каталоги

- `services/*` — API-клиенты, socket-клиент и session helpers.
- `hooks/*` — кастомные hooks (`useAuth`, `useGames`, `useSockets`, и пр.).
- `theme/*` — дизайн-токены и глобальные стили темы (цвета, типографика, spacing, анимации, состояния).
- `test/*` — test utilities (`renderWithProviders`, глобальный setup).

## Принцип разделения ответственности

- `pages` оркестрируют пользовательский flow.
- `features` инкапсулируют бизнес-сценарии.
- `services` инкапсулируют транспорт и протоколы.
- `shared` поставляет переиспользуемые примитивы без привязки к конкретной фиче.
