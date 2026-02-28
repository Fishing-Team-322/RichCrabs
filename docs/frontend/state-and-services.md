# Frontend: state and services

## 1) Управление состоянием

- Глобальный store расположен в `src/store/` (Redux Toolkit).
- Основные slices: auth, user, profile, billing, quizzes, rooms, bots, game/gameSession.
- Для тестов store-логики используются unit/integration тесты в `src/store/slices/__tests__` и `src/integration/__tests__`.

## 2) Карта API-клиентов

Ниже — целевая карта клиентских интеграций из `src/services/*`.

### `billingApi.ts`

- `plans()` → `GET /api/v1/billing/plans`
- `current()` → `GET /api/v1/billing/current` (есть fallback на free-plan при пустом payload)
- `checkout(payload)` → `POST /api/v1/billing/checkout`
- `cancel()` → `POST /api/v1/billing/cancel`
- `history()` → `GET /api/v1/billing/history`
- `applyPromo(payload)` → `POST /api/v1/billing/promo`
- `paymentCallbackStatus(payload)` → `POST /api/v1/billing/callback-status`

### `botsApi.ts`

- `list()` → `GET /api/v1/bots`
- `create(payload)` → `POST /api/v1/bots`
- `remove(botId)` → `DELETE /api/v1/bots/:botId`
- `validate(payload)` → `POST /api/v1/telegram/bots/connect`
- `bind(payload)` → `POST /api/v1/telegram/bots/connect`
- `status()` → `GET /api/v1/telegram/bots/status`
- `unbind()` → `DELETE /api/v1/telegram/bots/:botId` (если botId доступен из `status()`)

### `gameApi.ts`

Композиционный фасад над другими API:

- `create` проксируется в `quizApi.create`
- `join` проксируется в `joinApi.joinRoom`
- `getOpenGames` проксируется в `roomsApi.getOpenRooms`

### `joinApi.ts`

- Вход по PIN: `POST /api/v1/games/:pin/join`
- Вход по invite-token: `POST /api/v1/invites/:inviteToken/join`
- Валидация client-side: при отсутствии `pin` и `inviteToken` выбрасывается `Error`.

### `roomsApi.ts`

- `create(payload)` → `POST /api/v1/games`
- `list()` → `GET /api/v1/games`
- `open(roomId)` → `POST /api/v1/games/:roomId/start`
- `pause(roomId)` → `POST /api/v1/games/:roomId/pause`
- `details(roomId)` → `GET /api/v1/games/:roomId`
- `close(roomId)` → `POST /api/v1/games/:roomId/leave`
- `regenerateInvite(roomId)` → `POST /api/v1/games/:roomId/invite/regenerate`
- `getOpenRooms()` → `GET /api/v1/games`
- `getRoomState(roomId)` → `GET /api/v1/games/:roomId/state`
- `subscribeRoomDetails(...)` — polling-обёртка с устойчивостью к transient ошибкам.

### `socket.ts`

- Устанавливает WS-соединение c `joinTicket` в query string.
- Поддерживает heartbeat (`ping/pong`), измерение latency и оценку качества (`excellent/degraded/poor/offline`).
- Реализует reconnect с exponential backoff (`RECONNECT_BASE_DELAY_MS`, `RECONNECT_MAX_DELAY_MS`).
- Публичные команды: `connectSocket`, `disconnectSocket`, `requestGameState`, `sendStartGame`, `sendAnswer`, `requestChatHistory`, `sendChatMessage`.

## 3) Сценарии ошибок и обработка

Базовая обработка находится в `src/services/api.ts`:

- Все не-2xx HTTP ответы конвертируются в `AppError`.
- Для 401 вызывается `clearAuthTokens()` (очистка `token` / `refresh_token`).
- Для state-changing запросов (`POST/PUT/PATCH/DELETE`) добавляется CSRF header.
- При 403 выполняется однократный CSRF retry (рефетч токена + повтор запроса).
- Пустой ответ `204` возвращает `undefined`, чтобы не ломать обработчики.

Рекомендованные реакции UI:

- `401` → редирект к auth flow и очистка локального профиля пользователя.
- `403` → показать уведомление о недостатке прав / повторить действие после обновления сессии.
- `5xx`/network failure → показать toast + кнопку retry.
- WS heartbeat timeout / transport error → отображать degraded/offline индикатор и позволять ручной reconnect.
