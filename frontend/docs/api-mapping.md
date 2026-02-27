# UI ↔ Backend API mapping

Документ фиксирует, какие UI-экраны дергают какие backend endpoint-ы.

## Аутентификация

| UI экран | Роут | Endpoint | Метод | Назначение |
|---|---|---|---|---|
| Login | `/auth/login` | `/api/auth/login` | POST | Вход пользователя |
| Register | `/auth/register` | `/api/auth/register` | POST | Регистрация пользователя |
| Session restore (boot) | n/a (app init) | `/api/auth/refresh` | POST | Обновление access token по refresh token |

## Квизы (authoring + publish)

| UI экран | Роут | Endpoint | Метод | Назначение |
|---|---|---|---|---|
| Quizzes list | `/quizzes` | `/api/quizzes?status=&search=` | GET | Список квизов по фильтру |
| Create quiz (manual) | `/quizzes/new` | `/api/quizzes/draft` | POST | Создать пустой draft |
| Create quiz (AI start) | `/quizzes/new` | `/api/quizzes/generate` | POST | Запустить AI генерацию |
| Create quiz (AI polling) | `/quizzes/new` | `/api/quizzes/generate/:jobId` | GET | Проверить статус job |
| Quiz editor (load) | `/quizzes/:quizId/edit` | `/api/quizzes/:quizId/draft` | GET | Загрузить draft |
| Quiz editor (autosave) | `/quizzes/:quizId/edit` | `/api/quizzes/:quizId/draft` | PUT | Сохранить draft |
| Publish page (load versions) | `/quizzes/:quizId/publish` | `/api/quizzes/:quizId/versions` | GET | Получить историю версий |
| Publish action | `/quizzes/:quizId/publish` | `/api/quizzes/:quizId/publish` | POST | Опубликовать квиз |
| Unpublish action | `/quizzes/:quizId/publish` | `/api/quizzes/:quizId/unpublish` | POST | Снять публикацию |

## Комнаты и игра

| UI экран | Роут | Endpoint | Метод | Назначение |
|---|---|---|---|---|
| Rooms list | `/rooms` | `/api/rooms?status=` | GET | Список комнат |
| Create room (load quizzes) | `/rooms/new` | `/api/quizzes?status=published` | GET | Выбор опубликованного квиза |
| Create room (submit) | `/rooms/new` | `/api/rooms` | POST | Создать комнату |
| Room details (polling) | `/rooms/:roomId` | `/api/rooms/:roomId` | GET | Детали и статус комнаты |
| Room details → start | `/rooms/:roomId` | `/api/rooms/:roomId/open` | POST | Открыть/запустить комнату |
| Room details → pause | `/rooms/:roomId` | `/api/rooms/:roomId/pause` | POST | Поставить комнату на паузу |
| Room details → finish | `/rooms/:roomId` | `/api/rooms/:roomId/close` | POST | Завершить комнату |
| Open games (legacy helper) | n/a | `/api/games/open` | GET | Список открытых игр |
| Game state (legacy helper) | n/a | `/api/games/:roomId/state` | GET | Состояние игры |

## Join сценарии

| UI экран | Роут | Endpoint | Метод | Назначение |
|---|---|---|---|---|
| Join by PIN | `/join` | `/api/games/join` | POST | Вход в комнату по `pin` + `playerName` |
| Join by invite token | `/join`, `/invite/:token` | `/api/games/join` | POST | Вход по `inviteToken` + `playerName` |

## Runtime (HTTP + WebSocket)

| UI экран | Роут | Endpoint/Event | Тип | Назначение |
|---|---|---|---|---|
| Runtime page | `/quiz/:roomId` | `VITE_WS_URL` (socket.io) | WS | Подключение игрока к комнате |
| Runtime page | `/quiz/:roomId` | `getGameState` | WS event | Heartbeat/state sync |
| Runtime page | `/quiz/:roomId` | `startGame` | WS event | Старт игры |
| Runtime page | `/quiz/:roomId` | `answer` | WS event | Отправка ответа |
| Runtime page | `/quiz/:roomId` | `gameState`, `answerResult`, `reconnectState` | WS event | Получение актуального состояния |

## Профиль и биллинг

| UI экран | Роут | Endpoint | Метод | Назначение |
|---|---|---|---|---|
| Profile | `/profile` | `/api/user/profile` | GET | Получить профиль |
| Profile | `/profile` | `/api/user/profile` | PATCH | Обновить профиль |
| Profile | `/profile` | `/api/user/profile/password` | POST | Смена пароля |
| Profile | `/profile` | `/api/user/profile/sessions` | GET | Активные сессии |
| Subscriptions | `/subscriptions` | `/api/billing/plans` | GET | Доступные планы |
| Subscriptions | `/subscriptions` | `/api/billing/current` | GET | Текущая подписка |
| Subscriptions | `/subscriptions` | `/api/billing/checkout` | POST | Создать checkout-сессию |
| Subscriptions | `/subscriptions` | `/api/billing/cancel` | POST | Отмена подписки |
| Subscriptions | `/subscriptions` | `/api/billing/history` | GET | История платежей |
| Subscriptions | `/subscriptions` | `/api/billing/promo` | POST | Применить промокод |
| Subscriptions | `/subscriptions` | `/api/billing/callback-status` | POST | Статус callback оплаты |

## Telegram bots

| UI экран | Роут | Endpoint | Метод | Назначение |
|---|---|---|---|---|
| Telegram bots page | `/bots` | `/api/bots/telegram/status` | GET | Текущий runtime-статус привязки |
| Telegram bots page | `/bots` | `/api/bots/telegram/validate` | POST | Валидация токена |
| Telegram bots page | `/bots` | `/api/bots/telegram/bind` | POST | Привязка токена |
| Telegram bots page | `/bots` | `/api/bots/telegram/unbind` | POST | Отвязка токена |
| (Доп. bot CRUD API в сервисе) | n/a | `/api/bots`, `/api/bots/:id` | GET/POST/DELETE | Управление ботами (сервисный слой) |
