# Gateway Python: операции

## Локальный запуск

```bash
cd gateway_py
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8080
```

## Тесты

```bash
cd gateway_py
pytest
```

## Наблюдаемость

- Используйте `/health` для автоматических health-check.
- При расследовании проверяйте связность с gRPC backend и Redis.

## Runbook инцидента

1. Проверить доступность `GET /health`.
2. Проверить доступность зависимостей (Redis/gRPC).
3. Сверить переменные окружения (`GW_*`).
4. Перезапустить gateway после исправления конфигурации.
