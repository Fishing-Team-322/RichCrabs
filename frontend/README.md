# Frontend (Vite + React + TypeScript)

Документ описывает текущее устройство `frontend/`, основные пользовательские маршруты, переменные окружения, запуск/сборку, а также текущие ограничения и ближайший roadmap.

## Структура проекта

```text
frontend/
  docs/
    flows.md          # продуктовые флоу (authoring, room lifecycle, join, telegram)
    api-mapping.md    # соответствие UI-экранов и backend endpoint-ов
  public/             # статические публичные ассеты
  scripts/            # утилиты для predev/prebuild
  src/
    app/
      providers/      # BrowserRouter, Redux Provider, ThemeProvider, notifications, i18n
      router/         # route map, guards, маршрутизация
      App.tsx         # composition root (providers + router)
    components/       # переиспользуемые UI-компоненты
    hooks/            # клиентские хуки (в т.ч. websocket)
    locales/          # i18n словари
    pages/            # route-level экраны
      auth/
      join/
      quizzes/
      rooms/
      TelegramBots/
      ...
    services/         # API-клиенты (auth, quizzes, rooms, join, bots, billing, profile, socket)
    shared/           # валидации и общее
    store/            # redux store + slices
    theme/            # темы/дизайн-токены
    types/            # DTO и типы домена
    main.tsx          # точка входа
  index.html
  vite.config.ts
  package.json
```

### Архитектурные принципы

- `pages/*` — только route-level экраны и orchestration сценариев.
- Работа с backend делается через `src/services/*` (единая зона HTTP/WebSocket интеграций).
- Кросс-страничное состояние хранится в Redux slices (`src/store/slices/*`).
- Роутинг централизован в `src/app/router/AppRouter.tsx` и `routeMap.ts`.

## Роуты приложения

### Публичные

- `/` — Home.
- `/join` — вход в комнату по PIN или invite token.
- `/invite/:token` — вход по токену из ссылки-приглашения.
- `/quiz/:roomId` — runtime экран игры для игрока.
- `/auth/login` — логин (только для неавторизованных).
- `/auth/register` — регистрация (только для неавторизованных).

### Для авторизованных (через `AuthGuard`)

- `/quizzes` — список квизов.
- `/quizzes/new` — создание квиза (manual/AI).
- `/quizzes/:quizId/edit` — редактор draft.
- `/quizzes/:quizId/publish` — публикация/снятие с публикации + история версий.
- `/rooms` — список комнат.
- `/rooms/new` — создание комнаты.
- `/rooms/:roomId` — карточка комнаты, host-контролы, invite/PIN/QR.
- `/profile` — профиль пользователя.
- `/subscriptions` — подписки/биллинг.
- `/bots` — интеграция Telegram-бота.
- `/admin/dashboard` — заглушка admin dashboard.
- `/admin/security` — заглушка admin security.

### Fallback

- `*` — 404 страница.

## Environment variables

Создайте `.env` или `.env.local` в `frontend/`:

```bash
VITE_API_BASE_URL=http://localhost:5000
VITE_WS_URL=http://localhost:5000
VITE_APP_ENV=development
```

- `VITE_API_BASE_URL` — базовый URL для HTTP запросов (`apiFetch`).
- `VITE_WS_URL` — URL socket.io сервера для realtime runtime.
- `VITE_APP_ENV` — метка окружения (`development|staging|production|...`).

## Запуск и сборка

> Требования: Node.js 18+ (рекомендуется актуальный LTS) и npm.

### Установка зависимостей

```bash
cd frontend
npm ci
```

### Локальный запуск (dev)

```bash
npm run dev
```

- Запускает Vite dev server.
- Перед стартом выполняется `predev` (`scripts/ensure-i18n-deps.cjs`).

### Production-сборка

```bash
npm run build
```

- Выполняется `prebuild` (проверка i18n зависимостей), затем `vite build`.
- Результат сборки — директория `frontend/dist`.

### Preview production-сборки

```bash
npm run preview
```

## Подробные документы

- Product flows: [`docs/flows.md`](./docs/flows.md)
- API mapping: [`docs/api-mapping.md`](./docs/api-mapping.md)

## Known limitations

1. **QR генерация завязана на внешний сервис** (`api.qrserver.com`), поэтому при блокировке внешней сети/ограничениях CSP превью QR может не загрузиться.
2. **Частично смешанные realtime-контракты**: runtime использует socket-события, а часть legacy-хуков — устаревшие event names; нужен единый контракт.
3. **Polling вместо push для карточки комнаты**: обновления комнаты идут по интервалу, а не через realtime подписку.
4. **Admin разделы пока заглушки**: роуты существуют, но полноценного admin UI нет.
5. **Ограниченная observability на фронте**: нет централизованного клиентского трассинга/метрик UX-ошибок.

## Roadmap (следующий этап)

1. **Унифицировать realtime слой**: один event contract для host/player/runtime, удалить legacy socket события.
2. **Перевести room updates на realtime**: убрать polling для деталей комнаты и состояния игры там, где это возможно.
3. **Расширить admin UI**: наполнить `/admin/*` реальными сценариями и связать с backend RBAC.
4. **Усилить DX и quality gates**: добавить lint/typecheck/test скрипты в CI и базовый smoke e2e на ключевые пользовательские флоу.
5. **Улучшить устойчивость invite/QR**: локальная генерация QR как fallback и явные UX-сообщения при сетевых ограничениях.
