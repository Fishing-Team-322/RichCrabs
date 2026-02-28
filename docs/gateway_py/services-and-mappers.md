# Gateway Python: services and mappers

## Service layer (`gateway_py/app/services/*.py`)

### Ответственность
- Держать минимальную orchestration-логику вне роутеров.
- Работать как адаптер между API и инфраструктурой (gRPC/Redis).

### Ключевые сервисы
- `game_service.py`
  - `list_rooms(owner_user_id, include_public)` — запрос списка комнат через game gRPC + map snapshot.
  - `resolve_host_room(user_id, pin)` — поиск комнаты хоста по PIN.
- `quiz_service.py`
  - `list_quizzes(limit, page_token, owner_user_id)` — пагинация и сериализация квизов.
  - `get_quiz(quiz_id)` — получение quiz protobuf-сущности.
- `billing_service.py`
  - in-memory модель биллинга в Redis: `load_subscription/save_subscription/history/usage/checkout/apply_promo`.
  - ведёт транзакционную историю (`append_tx`) и подписки (`billing:sub:*`).
- `bot_service.py`
  - `bot_metadata(uid)` — metadata для gRPC authz.
  - `store_binding(bot_id, uid, token)` — сохраняет Telegram binding + secret в Redis.

### Типовые ошибки сервисного слоя
- Redis недоступен (`redis_url` неверный или сервис down).
- Повреждённый JSON в Redis ключах (fallback на default/ignore).
- gRPC исключения всплывают в роутер и маппятся в `map_grpc_err`.

## Mapper layer (`gateway_py/app/mappers/*.py`)

### Ответственность
- Стабилизировать ответ API и скрывать protobuf-детали.
- Нормализовать enum/state/timestamp поля.

### Ключевые мапперы
- `room_mapper.py`
  - `canonical_invite_path()`;
  - `ts_to_iso8601()`;
  - `normalize_room_state()`;
  - `settings_to_dict()`;
  - `map_room_snapshot()`.
- `quiz_mapper.py`
  - `quiz_to_json()` с аккуратной обработкой optional `correct_option_index`.
- `event_mapper.py`
  - `room_event_to_dict()`:
    1) сначала `MessageToDict`;
    2) fallback в `json.loads(str(ev))`;
    3) fallback в `{"raw": ...}`.

### Сценарии вызова
1. Роутер `games.py` получает protobuf `RoomSnapshot`.
2. `game_service.list_rooms()` применяет `map_room_snapshot()`.
3. Клиент получает стабильный JSON (`playersCount`, `settings`, `isPublic`, `updatedAt`).

1. WS stream в `ws.py` получает protobuf-событие.
2. `room_event_to_dict()` преобразует в JSON-friendly payload.
3. Gateway отправляет `{"type":"room_event","event":...}`.

## Пример HTTP/WS флоу через service+mapper
- **HTTP:** `GET /api/v1/quizzes` → `quiz_service.list_quizzes()` → `quiz_to_json()` → `{items:[...]}`.
- **WS:** `/ws` subscription → `clients.game.SubscribeRoomEvents()` → `room_event_to_dict()` → frontend update.

## Диагностика ошибок
- Если в ответах API «поплыли» поля состояния комнаты — проверить `normalize_room_state()`.
- Если в WS приходят `raw` вместо structured event — проверить формат protobuf/event и fallback-путь в `event_mapper.py`.
- Если в billing нет истории — проверить Redis ключи `billing:history:{uid}` и логи операций checkout/callback.
