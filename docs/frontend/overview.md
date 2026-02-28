# Frontend: обзор

Frontend расположен в `frontend/` и реализован на Vite + React + TypeScript.

## Назначение

- UI для авторов квизов и игроков.
- Поддержка auth, room lifecycle, gameplay, billing и bot flows.
- Интеграция с gateway HTTP API и realtime каналами.

## Ключевые зоны

- `src/pages/` — route-level страницы.
- `src/components/` — переиспользуемый UI.
- `src/services/` — API и socket-клиенты.
- `src/store/` — глобальное состояние.
- `src/app/router/` — маршрутизация и guards.
