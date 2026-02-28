# Frontend: API и realtime интеграции

## HTTP клиенты

Базовые интеграции сосредоточены в `src/services/*`:

- `authApi`, `profileApi`
- `quizApi`, `roomsApi`, `gameApi`, `joinApi`
- `billingApi`, `botsApi`, `serviceApi`

## Realtime

- Socket-клиент находится в `src/services/socket.ts`.
- Runtime сценарии игры используют push-события для состояния комнаты/матча.

## Контракт с gateway

- Базовый URL задается через `VITE_API_BASE_URL`.
- Realtime URL задается через `VITE_WS_URL`.
- Для защищенных операций учитываются cookie/csrf-механизмы backend.
