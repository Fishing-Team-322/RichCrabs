# Frontend: архитектура

## Архитектурный каркас

- Composition root: `src/app/App.tsx` + providers.
- Router-first подход: страницы связываются через route map.
- API-ориентированная интеграция через `src/services/*`.

## Слои

1. `pages` — orchestration пользовательских сценариев.
2. `components` — визуальные блоки и UI-kit.
3. `services` — HTTP/WebSocket интеграции.
4. `store` — state management (Redux slices).

## i18n и UX

- Локализация хранится в `src/locales`.
- Для уведомлений используется provider-подход.
