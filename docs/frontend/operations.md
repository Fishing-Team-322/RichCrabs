# Frontend: операции

## Установка зависимостей

```bash
cd frontend
npm ci
```

## Запуск в dev-режиме

```bash
npm run dev
```

## Сборка и проверка

```bash
npm run build
npm run preview
```

## Тестирование

```bash
npm run test
```

## Типовые проблемы

- CORS/401 ошибки: проверьте базовые URL и cookie политику.
- Ошибки realtime: проверьте `VITE_WS_URL` и доступность gateway ws маршрутов.
- Ошибки сборки: перепроверьте Node/npm версии и lockfile.
