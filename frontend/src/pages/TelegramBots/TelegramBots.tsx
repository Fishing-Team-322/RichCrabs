import { FormEvent, useEffect, useState } from 'react'
import { botsApi } from '../../services/botsApi'
import type { BotRuntimeOperationDto, TelegramBotRuntimeStatusDto, ValidateTelegramBotResponseDto } from '../../types/bot.types'
import './telegramBots.css'

const formatDate = (value?: string) => {
  if (!value) return '—'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return parsed.toLocaleString('ru-RU')
}

const operationLabel = (operation: BotRuntimeOperationDto) => {
  if (operation.type === 'room_created') {
    return `Создана комната${operation.roomTitle ? `: ${operation.roomTitle}` : ''}`
  }
  if (operation.type === 'pin_issued') {
    return `Выдан PIN${operation.value ? `: ${operation.value}` : ''}`
  }
  if (operation.type === 'invite_issued') {
    return `Выдан invite${operation.value ? `: ${operation.value}` : ''}`
  }
  return operation.type
}

const TelegramBots = () => {
  const [token, setToken] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isValidating, setIsValidating] = useState(false)
  const [isBinding, setIsBinding] = useState(false)
  const [isUnbinding, setIsUnbinding] = useState(false)

  const [status, setStatus] = useState<TelegramBotRuntimeStatusDto | null>(null)
  const [validation, setValidation] = useState<ValidateTelegramBotResponseDto | null>(null)

  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const loadStatus = async () => {
    setIsLoading(true)
    setError(null)
    try {
      const data = await botsApi.status()
      setStatus(data)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Не удалось загрузить статус бота'
      setError(message)
      setStatus(null)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    void loadStatus()
  }, [])

  const onValidate = async (event: FormEvent) => {
    event.preventDefault()
    if (!token.trim()) return

    setIsValidating(true)
    setError(null)
    setSuccess(null)
    setValidation(null)

    try {
      const result = await botsApi.validate({ token: token.trim() })
      setValidation(result)
      if (!result.ok) {
        setError(result.message || 'Токен не прошёл проверку')
      } else {
        setSuccess(`Токен валиден${result.username ? ` (@${result.username})` : ''}`)
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Не удалось проверить токен'
      setError(message)
    } finally {
      setIsValidating(false)
    }
  }

  const onBind = async () => {
    if (!token.trim()) return

    setIsBinding(true)
    setError(null)
    setSuccess(null)

    try {
      await botsApi.bind({ token: token.trim() })
      setToken('')
      setValidation(null)
      setSuccess('Бот успешно привязан к вашему аккаунту')
      await loadStatus()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Не удалось привязать бота'
      setError(message)
    } finally {
      setIsBinding(false)
    }
  }

  const onUnbind = async () => {
    setIsUnbinding(true)
    setError(null)
    setSuccess(null)

    try {
      await botsApi.unbind()
      setStatus(null)
      setValidation(null)
      setSuccess('Привязка Telegram-бота отключена')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Не удалось отключить токен'
      setError(message)
    } finally {
      setIsUnbinding(false)
    }
  }

  return (
    <section className="telegramBotsPage">
      <article className="pageCard">
        <h1>Telegram-боты</h1>
        <p className="telegramBotsMuted">Подключите bot token, чтобы создавать комнаты и выдавать приглашения через Telegram.</p>

        <div className="telegramBotsWarning">
          ⚠️ Пользовательский код бота не исполняется. Используется общий runtime платформы RichCrabs.
        </div>

        {error && <div className="telegramBotsError">{error}</div>}
        {success && <div className="telegramBotsSuccess">{success}</div>}

        <form className="telegramBotsForm" onSubmit={onValidate}>
          <label>
            Bot token
            <input
              type="password"
              value={token}
              onChange={(event) => setToken(event.target.value)}
              placeholder="123456789:AA..."
              autoComplete="off"
            />
          </label>

          <div className="telegramBotsActions">
            <button type="submit" disabled={isValidating || isBinding || !token.trim()}>
              {isValidating ? 'Проверяем...' : 'Проверить токен'}
            </button>
            <button
              type="button"
              className="secondary"
              onClick={() => void onBind()}
              disabled={isBinding || isValidating || !token.trim() || validation?.ok === false}
            >
              {isBinding ? 'Привязываем...' : 'Сохранить привязку'}
            </button>
            <button type="button" className="danger" onClick={() => void onUnbind()} disabled={isUnbinding || !status}>
              {isUnbinding ? 'Отключаем...' : 'Отключить токен'}
            </button>
          </div>
        </form>

        <div className="telegramBotsHint">
          <h3>Как выдать права боту в Telegram</h3>
          <ol>
            <li>Создайте бота через @BotFather и получите token.</li>
            <li>Добавьте бота в нужный чат/группу.</li>
            <li>Выдайте боту права администратора: управление сообщениями и приглашениями.</li>
            <li>Отключите Privacy Mode в @BotFather, если нужны команды в группах.</li>
          </ol>
        </div>
      </article>

      <article className="pageCard">
        <div className="telegramBotsStatusHead">
          <h2>Runtime-статус</h2>
          <button type="button" className="secondary" onClick={() => void loadStatus()} disabled={isLoading}>
            {isLoading ? 'Обновляем...' : 'Обновить статус'}
          </button>
        </div>

        {!status ? (
          <p className="telegramBotsMuted">{isLoading ? 'Загружаем статус...' : 'Бот пока не привязан.'}</p>
        ) : (
          <div className="telegramBotsStatusGrid">
            <div>
              <div className="statusLabel">Бот</div>
              <div className="statusValue">{status.name || status.username || '—'}</div>
            </div>
            <div>
              <div className="statusLabel">Состояние</div>
              <div className={`statusValue ${status.active ? 'ok' : 'muted'}`}>{status.active ? 'Активен' : 'Неактивен'}</div>
            </div>
            <div>
              <div className="statusLabel">Last seen</div>
              <div className="statusValue">{formatDate(status.lastSeenAt)}</div>
            </div>

            <div className="operationsBlock">
              <div className="statusLabel">Последние операции</div>
              {status.operations.length ? (
                <ul>
                  {status.operations.slice(0, 8).map((operation) => (
                    <li key={operation.id}>
                      <strong>{operationLabel(operation)}</strong>
                      <span>{formatDate(operation.createdAt)}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="telegramBotsMuted">Операций пока нет.</p>
              )}
            </div>
          </div>
        )}
      </article>
    </section>
  )
}

export default TelegramBots
