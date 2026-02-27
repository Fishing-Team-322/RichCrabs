import { useEffect, useState, type FormEvent } from 'react'
import { botsApi } from '../../services/botsApi'
import { Skeleton } from '../../components/ui'
import { useNotifications } from '../../app/providers/NotificationProvider'
import { validateBotToken } from '../../shared/validation/formSchemas'
import type { BotRuntimeOperationDto, TelegramBotRuntimeStatusDto, ValidateTelegramBotResponseDto } from '../../types/bot.types'
import './telegramBots.css'

const formatDate = (value?: string) => {
  if (!value) return '—'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return parsed.toLocaleString('ru-RU')
}

const operationLabel = (operation: BotRuntimeOperationDto) => {
  if (operation.type === 'room_created') return `Создана комната${operation.roomTitle ? `: ${operation.roomTitle}` : ''}`
  if (operation.type === 'pin_issued') return `Выдан PIN${operation.value ? `: ${operation.value}` : ''}`
  if (operation.type === 'invite_issued') return `Выдан invite${operation.value ? `: ${operation.value}` : ''}`
  return operation.type
}

const TelegramBots = () => {
  const notifications = useNotifications()
  const [token, setToken] = useState('')
  const [tokenError, setTokenError] = useState('')
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
      setStatus(await botsApi.status())
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Не удалось загрузить статус бота'
      setError(message)
      notifications.error(message)
      setStatus(null)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => { void loadStatus() }, [])

  const validateTokenInput = () => {
    const errors = validateBotToken({ token })
    if (errors.token) {
      setTokenError(errors.token)
      return false
    }
    setTokenError('')
    return true
  }

  const onValidate = async (event: FormEvent) => {
    event.preventDefault()
    if (!validateTokenInput()) return

    setIsValidating(true)
    setError(null)
    setSuccess(null)
    setValidation(null)
    try {
      const result = await botsApi.validate({ token: token.trim() })
      setValidation(result)
      if (!result.ok) {
        const message = result.message || 'Токен не прошёл проверку'
        setError(message)
        notifications.error(message)
      } else {
        const message = `Токен валиден${result.username ? ` (@${result.username})` : ''}`
        setSuccess(message)
        notifications.success(message)
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Не удалось проверить токен'
      setError(message)
      notifications.error(message)
    } finally {
      setIsValidating(false)
    }
  }

  const onBind = async () => {
    if (!validateTokenInput()) return
    setIsBinding(true)
    setError(null)
    setSuccess(null)
    try {
      await botsApi.bind({ token: token.trim() })
      setToken('')
      setValidation(null)
      const message = 'Бот успешно привязан к вашему аккаунту'
      setSuccess(message)
      notifications.success(message)
      await loadStatus()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Не удалось привязать бота'
      setError(message)
      notifications.error(message)
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
      const message = 'Привязка Telegram-бота отключена'
      setSuccess(message)
      notifications.success(message)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Не удалось отключить токен'
      setError(message)
      notifications.error(message)
    } finally {
      setIsUnbinding(false)
    }
  }

  return (
    <section className="telegramBotsPage">
      <article className="pageCard">
        <h1>Telegram-боты</h1>
        <p className="telegramBotsMuted">Подключите bot token, чтобы создавать комнаты и выдавать приглашения через Telegram.</p>
        <div className="telegramBotsWarning">⚠️ Пользовательский код бота не исполняется. Используется общий runtime платформы RichCrabs.</div>
        {error && <div className="telegramBotsError">{error}</div>}
        {success && <div className="telegramBotsSuccess">{success}</div>}

        <form className="telegramBotsForm" onSubmit={(event) => void onValidate(event)}>
          <label>Bot token
            <input type="password" value={token} onChange={(event) => setToken(event.target.value)} className={tokenError ? 'error' : ''} placeholder="123456789:AA..." autoComplete="off" />
            {tokenError && <span className="ui-help">{tokenError}</span>}
          </label>
          <div className="telegramBotsActions">
            <button type="submit" disabled={isValidating || isBinding || !token.trim()}>{isValidating ? 'Проверяем...' : 'Проверить токен'}</button>
            <button type="button" className="secondary" onClick={() => void onBind()} disabled={isBinding || isValidating || !token.trim() || validation?.ok === false}>{isBinding ? 'Привязываем...' : 'Сохранить привязку'}</button>
            <button type="button" className="danger" onClick={() => void onUnbind()} disabled={isUnbinding || !status}>{isUnbinding ? 'Отключаем...' : 'Отключить токен'}</button>
          </div>
        </form>
      </article>

      <article className="pageCard">
        <div className="telegramBotsStatusHead"><h2>Runtime-статус</h2><button type="button" className="secondary" onClick={() => void loadStatus()} disabled={isLoading}>{isLoading ? 'Обновляем...' : 'Обновить статус'}</button></div>
        {isLoading ? <div className="telegramBotsStatusSkeleton"><Skeleton height={20} /><Skeleton height={20} /><Skeleton height={20} /><Skeleton height={120} /></div> : !status ? <p className="telegramBotsMuted">Бот пока не привязан.</p> : (
          <div className="telegramBotsStatusGrid">
            <div><div className="statusLabel">Бот</div><div className="statusValue">{status.name || status.username || '—'}</div></div>
            <div><div className="statusLabel">Состояние</div><div className={`statusValue ${status.active ? 'ok' : 'muted'}`}>{status.active ? 'Активен' : 'Неактивен'}</div></div>
            <div><div className="statusLabel">Last seen</div><div className="statusValue">{formatDate(status.lastSeenAt)}</div></div>
            <div className="operationsBlock"><div className="statusLabel">Последние операции</div>{status.operations.length ? <ul>{status.operations.slice(0, 8).map((operation) => <li key={operation.id}><strong>{operationLabel(operation)}</strong><span>{formatDate(operation.createdAt)}</span></li>)}</ul> : <p className="telegramBotsMuted">Операций пока нет.</p>}</div>
          </div>
        )}
      </article>
    </section>
  )
}

export default TelegramBots
