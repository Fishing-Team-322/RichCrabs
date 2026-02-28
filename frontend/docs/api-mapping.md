# UI ↔ Backend API mapping

Документ фиксирует текущее соответствие frontend-сервисов и контрактов Python gateway (`/api/v1/*`).

## Аутентификация

| UI экран | Endpoint | Метод | Назначение |
|---|---|---|---|
| Login/Register | `/api/v1/auth/login`, `/api/v1/auth/register` | POST | Вход/регистрация |
| CSRF bootstrap | `/api/v1/auth/csrf` | GET | Получить CSRF token |
| Logout | `/api/v1/auth/logout` | POST | Очистить сессию |

## Платформа (`serviceApi`)

| UI экран | Endpoint | Метод | Назначение |
|---|---|---|---|
| Home bootstrap | `/api/v1/healthz`, `/api/v1/session` | GET | Проверка доступности gateway и статуса текущей сессии |

## Квизы (`quizApi`)

| Метод сервиса | Endpoint | Метод | Gateway shape |
|---|---|---|---|
| `list` | `/api/v1/quizzes` | GET | `{ items: Quiz[] }` |
| `draft` / `createDraft` | `/api/v1/quizzes` | POST | `{ quiz: Quiz, status }` |
| `getDraft` | `/api/v1/quizzes/{quizId}` | GET | `{ quiz: Quiz }` |
| `saveDraft` | `/api/v1/quizzes/{quizId}` | PATCH | `{ quiz: Quiz, status }` |
| `publish` | `/api/v1/quizzes/{quizId}/publish` | POST | `{ quiz: { quizId }, publishedVersion, status }` |
| `startGeneration` | `/api/v1/quizzes/ai-generate` | POST | `{ jobId, status }` |
| `getGenerationStatus` | `/api/v1/quizzes/ai-jobs/{jobId}` | GET | `{ jobId, status, quiz? }` |

> Endpoint-ов `/unpublish`, `/versions`, `/quizzes/{id}/draft` в Python gateway сейчас нет.

## Комнаты и игра (`roomsApi`, `joinApi`)

| Метод сервиса | Endpoint | Метод | Gateway shape |
|---|---|---|---|
| `create` | `/api/v1/games` | POST | `{ pin, inviteToken, inviteUrl, wsUrl }` |
| `details` | `/api/v1/games/{pin}` | GET | `{ pin, state, players[] }` |
| `open` | `/api/v1/games/{pin}/start` | POST | `204` |
| `pause` | `/api/v1/games/{pin}/pause` | POST | `204` |
| `close` | `/api/v1/games/{pin}/leave` | POST | `204` |
| `getRoomState` | `/api/v1/games/{pin}/state` | GET | `{ pin, state, players[] }` |
| `joinByPin` | `/api/v1/games/{pin}/join` | POST | `{ playerId, joinTicket, roomPin, ... }` |
| `joinByInviteToken` | `/api/v1/invites/{inviteToken}/join` | POST | `{ playerId, joinTicket, roomPin, ... }` |

## Боты и Telegram (`botsApi`)

| Метод сервиса | Endpoint | Метод | Gateway shape |
|---|---|---|---|
| `list` | `/api/v1/bots` | GET | `{ bots: Bot[] }` |
| `create` | `/api/v1/bots` | POST | `{ bot: Bot }` |
| `remove` | `/api/v1/bots/{botId}` | DELETE | `204` |
| `validate` / `bind` | `/api/v1/telegram/bots/connect` | POST | `{ botId, webhookUrl, status }` |
| `status` | `/api/v1/bots` | GET | агрегируется из списка |
| `unbind` | `/api/v1/bots/{botId}` | DELETE | удаление привязки |

## Биллинг (`billingApi`)

| Метод сервиса | Endpoint | Статус |
|---|---|---|
| `plans` | `/api/v1/billing/plans` | Поддерживается |
| `current` | `/api/v1/billing/current` | Поддерживается |
| `history` | `/api/v1/billing/history` | Поддерживается |
| `checkout` / `cancel` / `applyPromo` / `paymentCallbackStatus` | `/api/v1/billing/*` | Поддерживается |
