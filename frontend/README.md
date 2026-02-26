# Frontend architecture

## Directory structure (`frontend/src`)

```text
src/
  app/          # application bootstrap: providers, router, app composition
  pages/        # route-level pages
    admin/      # admin-only route pages (inside the same frontend app)
  features/     # business features (auth, quizzes, rooms, bots, billing)
  entities/     # core domain entities and related models/types
  shared/       # cross-cutting reusable layer (ui, utils, api)
```

## Layer responsibilities

### `app/`
- Инициализация приложения.
- Глобальные провайдеры (`Redux`, `Theme`, `Router`) в `app/providers`.
- Корневой роутинг в `app/router`.

### `pages/`
- Только route-level контейнеры.
- Содержат компоновку фич для конкретного URL.
- Для админских экранов используйте исключительно `pages/admin/*`.

### `features/`
- Завершённые пользовательские сценарии.
- Текущие целевые домены: `auth`, `quizzes`, `rooms`, `bots`, `billing`.
- У каждой фичи должен быть публичный API (например, через `index.ts`).

### `entities/`
- Базовые доменные типы и модели.
- Общие структуры данных и примитивы, не зависящие от конкретной фичи.

### `shared/`
- `shared/ui` — UI-kit без бизнес-логики.
- `shared/utils` — утилиты.
- `shared/api` — базовый API client/транспорт.

## Mandatory rule about admin UI

- Отдельной админки `front_adm` **не существует**.
- Все admin-экраны разрабатываются внутри этого приложения и располагаются в `frontend/src/pages/admin/*`.

## Extension rules

1. Любой новый код размещайте в соответствующем слое по ответственности.
2. Избегайте прямых зависимостей между несоседними слоями (например, `shared` не должен зависеть от `features`).
3. Новые маршруты добавляйте только в `app/router/AppRouter.tsx`.
4. Новые глобальные провайдеры добавляйте только в `app/providers/AppProviders.tsx`.
5. Административные разделы создавайте только в `pages/admin/*` и подключайте через основной router.

## Environment variables

Создайте файл `.env` (или `.env.local`) в директории `frontend/` и задайте:

```bash
VITE_API_BASE_URL=http://localhost:5000
VITE_WS_URL=http://localhost:5000
VITE_APP_ENV=development
```

- `VITE_API_BASE_URL` — базовый URL HTTP API для `frontend/src/services/api.ts`.
- `VITE_WS_URL` — URL WebSocket/socket.io сервера для `frontend/src/services/socket.ts`.
- `VITE_APP_ENV` — произвольная метка окружения (`development`, `staging`, `production`) для feature flags/диагностики.
