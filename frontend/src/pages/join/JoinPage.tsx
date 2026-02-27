import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useNavigate } from 'react-router-dom'
import { routes } from '../../app/router/routeMap'
import { useNotifications } from '../../app/providers/NotificationProvider'
import { joinApi } from '../../services/joinApi'
import { playerSession } from '../../services/playerSession'
import { AppError } from '../../services/api'
import {
  joinByInviteSchema,
  joinByPinSchema,
  type JoinByInviteFormData,
  type JoinByPinFormData,
} from '../../shared/validation/formSchemas'
import '../rooms/rooms.css'

type JoinMethod = 'pin' | 'invite'

const humanizeJoinError = (error: unknown) => {
  if (!(error instanceof AppError)) {
    return 'Не удалось присоединиться к комнате. Попробуйте ещё раз.'
  }

  const code = (error.code || '').toLowerCase()
  const message = error.message.toLowerCase()

  if (code.includes('expired') || message.includes('expired') || message.includes('ист')) {
    return 'Ссылка или токен приглашения истекли. Попросите новый invite у host.'
  }

  if (code.includes('closed') || message.includes('closed') || message.includes('finish')) {
    return 'Комната уже закрыта для входа.'
  }

  if (code.includes('limit') || message.includes('limit') || message.includes('full')) {
    return 'Достигнут лимит игроков в комнате.'
  }

  if (error.status === 400 || error.status === 404) {
    return 'Неверный PIN или invite-token. Проверьте и попробуйте снова.'
  }

  return error.message || 'Не удалось присоединиться к комнате. Попробуйте ещё раз.'
}

const JoinPage = () => {
  const [tab, setTab] = useState<JoinMethod>('pin')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()
  const notifications = useNotifications()
  const defaultPlayerName = playerSession.getPlayerName()

  const pinForm = useForm<JoinByPinFormData>({
    resolver: zodResolver(joinByPinSchema),
    defaultValues: { playerName: defaultPlayerName, pin: '' },
  })

  const inviteForm = useForm<JoinByInviteFormData>({
    resolver: zodResolver(joinByInviteSchema),
    defaultValues: { playerName: defaultPlayerName, inviteToken: '' },
  })

  const onSubmitPin = async (data: JoinByPinFormData) => {
    setLoading(true)
    try {
      const response = await joinApi.joinByPin(data.pin.trim(), data.playerName.trim())
      playerSession.saveToken(response.token)
      playerSession.savePlayerName(data.playerName.trim())
      playerSession.savePlayerId(response.playerId)
      notifications.success('Вы успешно подключились к комнате.')
      navigate(routes.quizRuntime.replace(':roomId', response.gameId))
    } catch (joinError: unknown) {
      const message = humanizeJoinError(joinError)
      pinForm.setError('root', { message })
      notifications.error(message)
    } finally {
      setLoading(false)
    }
  }

  const onSubmitInvite = async (data: JoinByInviteFormData) => {
    setLoading(true)
    try {
      const response = await joinApi.joinByInviteToken(data.inviteToken.trim(), data.playerName.trim())
      playerSession.saveToken(response.token)
      playerSession.savePlayerName(data.playerName.trim())
      playerSession.savePlayerId(response.playerId)
      notifications.success('Вы успешно подключились к комнате.')
      navigate(routes.quizRuntime.replace(':roomId', response.gameId))
    } catch (joinError: unknown) {
      const message = humanizeJoinError(joinError)
      inviteForm.setError('root', { message })
      notifications.error(message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="roomsPage">
      <article className="pageCard roomForm">
        <h1>Вход в комнату</h1>
        <div className="roomsActions">
          <button className={`roomButton ${tab === 'pin' ? 'primary' : ''}`} type="button" onClick={() => setTab('pin')}>
            Ввод PIN
          </button>
          <button className={`roomButton ${tab === 'invite' ? 'primary' : ''}`} type="button" onClick={() => setTab('invite')}>
            Invite-token
          </button>
        </div>

        {tab === 'pin' ? (
          <form className="roomForm" onSubmit={pinForm.handleSubmit((data) => void onSubmitPin(data))}>
            <label>
              Имя игрока
              <input {...pinForm.register('playerName')} className={pinForm.formState.errors.playerName ? 'error' : ''} placeholder="Например: Alice" />
              {pinForm.formState.errors.playerName && <span className="ui-help">{pinForm.formState.errors.playerName.message}</span>}
            </label>
            <label>
              PIN комнаты
              <input {...pinForm.register('pin')} className={pinForm.formState.errors.pin ? 'error' : ''} placeholder="123456" />
              {pinForm.formState.errors.pin && <span className="ui-help">{pinForm.formState.errors.pin.message}</span>}
            </label>

            {pinForm.formState.errors.root?.message && <div className="roomError">{pinForm.formState.errors.root.message}</div>}
            <button className="roomButton primary" type="submit" disabled={loading}>
              {loading ? 'Подключаем...' : 'Войти в игру'}
            </button>
          </form>
        ) : (
          <form className="roomForm" onSubmit={inviteForm.handleSubmit((data) => void onSubmitInvite(data))}>
            <label>
              Имя игрока
              <input
                {...inviteForm.register('playerName')}
                className={inviteForm.formState.errors.playerName ? 'error' : ''}
                placeholder="Например: Alice"
              />
              {inviteForm.formState.errors.playerName && <span className="ui-help">{inviteForm.formState.errors.playerName.message}</span>}
            </label>
            <label>
              Invite-token
              <input
                {...inviteForm.register('inviteToken')}
                className={inviteForm.formState.errors.inviteToken ? 'error' : ''}
                placeholder="token из ссылки invite"
              />
              {inviteForm.formState.errors.inviteToken && <span className="ui-help">{inviteForm.formState.errors.inviteToken.message}</span>}
            </label>

            {inviteForm.formState.errors.root?.message && <div className="roomError">{inviteForm.formState.errors.root.message}</div>}
            <button className="roomButton primary" type="submit" disabled={loading}>
              {loading ? 'Подключаем...' : 'Войти в игру'}
            </button>
          </form>
        )}
      </article>
    </section>
  )
}

export default JoinPage
