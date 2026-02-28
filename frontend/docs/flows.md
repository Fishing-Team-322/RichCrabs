# Frontend product flows

Ниже зафиксированы ключевые пользовательские сценарии и переходы состояния, которые реализованы в текущем фронтенде.

## 1) Quiz authoring flow

### Вариант A: ручное создание
1. Пользователь открывает `/quizzes/new`.
2. Выбирает режим **Ручной**.
3. UI вызывает `POST /api/quizzes/draft`.
4. После создания draft происходит переход на `/quizzes/:quizId/edit`.
5. В редакторе изменения метаданных/вопросов автосохраняются через `PUT /api/quizzes/:quizId/draft` (debounce ~900ms).
6. Для публикации пользователь открывает `/quizzes/:quizId/publish`.
7. Перед publish UI выполняет локальную валидацию; при успехе — `POST /api/quizzes/:quizId/publish`.

### Вариант B: AI-генерация
1. Пользователь открывает `/quizzes/new`.
2. Выбирает режим **Через AI**, заполняет тему/сложность/число вопросов/язык/формат.
3. UI запускает job: `POST /api/quizzes/generate`.
4. Затем опрашивает статус `GET /api/quizzes/generate/:jobId`.
5. При `done` получает `draftId` и грузит draft через `GET /api/quizzes/:quizId/draft`.
6. Пользователь попадает в `/quizzes/:quizId/edit` и работает дальше как в ручном сценарии.

---

## 2) Room lifecycle flow

### Создание комнаты
1. Host открывает `/rooms/new`.
2. UI подгружает опубликованные квизы через `GET /api/quizzes?status=published`.
3. Host задаёт параметры комнаты (лимит, privacy, таймеры).
4. UI отправляет `POST /api/rooms`.
5. В ответ получает `pin`, `inviteLink`, `settings`, `status` и предлагает перейти в `/rooms/:roomId`.

### Управление жизненным циклом (host)
На карточке `/rooms/:roomId`:
- **Старт** → `POST /api/rooms/:roomId/open`
- **Пауза** → `POST /api/rooms/:roomId/pause`
- **Завершить** → `POST /api/rooms/:roomId/close` (+ повторная загрузка details)

Состояние комнаты подгружается polling-механизмом `GET /api/rooms/:roomId` (интервал по умолчанию 5 сек).

---

## 3) Join via PIN / invite / QR

### Join via PIN
1. Игрок открывает `/join`.
2. Выбирает вкладку PIN, вводит имя и PIN.
3. UI отправляет `POST /api/games/join` с `{ pin, playerName }`.
4. При успехе сохраняются `token`, `playerId`, `playerName` в client session.
5. Переход на `/quiz/:roomId`.

### Join via invite token
1. Игрок открывает `/join` (или `/invite/:token`, где токен предзаполнен).
2. Вводит имя (и при необходимости корректирует invite token).
3. UI отправляет `POST /api/games/join` с `{ inviteToken, playerName }`.
4. Далее тот же путь: сохранение сессии и переход на runtime.

### Join via QR
1. Host на `/rooms/:roomId` видит QR, который кодирует `inviteLink`.
2. Игрок сканирует QR и попадает на invite-link.
3. Далее используется сценарий join по invite token.

---

## 4) Telegram bot integration flow


### Telegram команды и WebApp lifecycle

Подключённые Telegram-боты используют единый lifecycle:

1. Пользователь отправляет `/start` в Telegram.
2. Bot runtime отвечает приветствием и клавиатурой с кнопкой `web_app` (URL квиз-интерфейса).
3. URL запуска содержит подписанный payload (`bot_id`, `user_id`, `chat_id`, `request_id`, `exp`) с коротким TTL.
4. Backend endpoint `/api/v1/telegram/webapp/launch` проверяет подпись и срок действия.
5. При валидном payload backend поднимает web-сессию quiz runtime и делает redirect в web-клиент (по умолчанию `/join`).
6. UI продолжает стандартный join/runtime flow уже в контексте установленной сессии.

Сопутствующие команды:
- `/create_game` — создать комнату.
- `/invite` — получить invite последней комнаты.
- `/pin` — получить PIN последней комнаты.


Экран: `/bots`.

1. При открытии страницы UI запрашивает runtime-статус через `GET /api/bots/telegram/status`.
2. Пользователь вводит bot token и нажимает **Проверить токен**:
   - `POST /api/bots/telegram/validate`
   - UI показывает `ok/message/username`.
3. При успешной проверке пользователь нажимает **Сохранить привязку**:
   - `POST /api/bots/telegram/bind`
   - затем повторно грузится статус.
4. Для отвязки используется **Отключить токен**:
   - `POST /api/bots/telegram/unbind`.

Ограничение текущего UX: пользовательский код бота не исполняется на фронте; используется общий runtime платформы.
