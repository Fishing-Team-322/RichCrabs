# Frontend: UI, i18n and testing

## 1) Локализация (i18n)

Текущая реализация:

- Инициализация i18n: `src/app/providers/i18n.ts`.
- Ресурсы переводов: `src/locales/ru/common.ts`, `src/locales/en/common.ts`.
- Компонент переключения языка: `src/components/LanguageSwitcher.tsx`.

Поведение:

- Поддерживаемые языки: `ru`, `en`.
- Язык выбирается по приоритету: `localStorage` (`richcrabs_language`) → язык браузера.
- `fallbackLng` установлен в `ru`.
- При смене языка обновляется `document.documentElement.lang`.

Правила расширения локализации:

1. Любой новый пользовательский текст добавлять одновременно в `ru/common.ts` и `en/common.ts`.
2. Использовать стабильные namespace/key (например, `billing.checkout.error`).
3. Избегать inline-строк в React-компонентах (вместо этого `t('...')`).
4. При добавлении новых разделов UI — сначала обновлять локали, затем компоненты.

## 2) Правила расширения UI

- Использовать существующие примитивы из `components/ui` и `shared/ui`.
- Поддерживать единые дизайн-токены из `theme/*` (цвета, spacing, typography, states, animations).
- Если компонент нужен в нескольких доменах — поднимать его в shared/ui или ui-kit.
- Новые формы валидировать через существующие схемы/паттерны в `shared/validation`.
- Добавлять accessibility hooks при необходимости (например, `useDialogA11y`).

## 3) Тестирование

### Unit/Integration (Vitest)

- Основной раннер: `npm run test` (`vitest run`).
- Покрытие: `npm run test:coverage`.
- Type safety check: `npm run typecheck`.
- Тесты распределены по каталогам:
  - `src/services/__tests__`
  - `src/store/slices/__tests__`
  - `src/pages/**/__tests__`
  - `src/integration/__tests__`
  - `src/shared/validation/__tests__`

### E2E smoke

- Конфигурация: `playwright.config.ts`.
- Базовый smoke-сценарий: `e2e/smoke.spec.ts`.
- Запуск: `npm run test:e2e`.

## 4) Рекомендации по регресс-проверкам

Минимальный чек-лист перед релизом UI-изменений:

1. Прогнать `npm run test` и убедиться, что проходят unit/integration тесты.
2. Прогнать `npm run test:e2e` для smoke-покрытия критических пользовательских маршрутов.
3. Прогнать `npm run typecheck` для проверки контрактов типов.
4. Проверить переключение языка RU/EN на изменённых экранах.
5. Проверить деградацию сети/API ошибок:
   - HTTP 401/403/5xx;
   - недоступный WS (должны корректно отображаться connection state/quality).
