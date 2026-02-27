import { FormEvent, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { routes } from '../../app/router/routeMap'
import { joinApi } from '../../services/joinApi'
import { playerSession } from '../../services/playerSession'
import { AppError } from '../../services/api'
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
  const [pin, setPin] = useState('')
  const [inviteToken, setInviteToken] = useState('')
  const [playerName, setPlayerName] = useState(playerSession.getPlayerName())
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const navigate = useNavigate()

  const validate = () => {
    if (!playerName.trim()) {
      return 'Введите имя игрока.'
    }

    if (tab === 'pin' && !pin.trim()) {
      return 'Введите PIN комнаты.'
    }

    if (tab === 'invite' && !inviteToken.trim()) {
      return 'Введите invite-token.'
    }

    return ''
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()

    const validationError = validate()
    if (validationError) {
      setError(validationError)
      return
    }

    setLoading(true)
    setError('')

    try {
      const response =
        tab === 'pin'
          ? await joinApi.joinByPin(pin.trim(), playerName.trim())
          : await joinApi.joinByInviteToken(inviteToken.trim(), playerName.trim())

      playerSession.saveToken(response.token)
      playerSession.savePlayerName(playerName.trim())
      playerSession.savePlayerId(response.playerId)
      navigate(routes.quizRuntime.replace(':roomId', response.gameId))
    } catch (joinError: unknown) {
      setError(humanizeJoinError(joinError))
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

        <form className="roomForm" onSubmit={(event) => void handleSubmit(event)}>
          <label>
            Имя игрока
            <input value={playerName} onChange={(event) => setPlayerName(event.target.value)} placeholder="Например: Alice" />
          </label>

          {tab === 'pin' ? (
            <label>
              PIN комнаты
              <input value={pin} onChange={(event) => setPin(event.target.value)} placeholder="123456" />
            </label>
          ) : (
            <label>
              Invite-token
              <input
                value={inviteToken}
                onChange={(event) => setInviteToken(event.target.value)}
                placeholder="token из ссылки invite"
              />
            </label>
          )}

          {error && <div className="roomError">{error}</div>}

          <button className="roomButton primary" type="submit" disabled={loading}>
            {loading ? 'Подключаем...' : 'Войти в игру'}
          </button>
        </form>
      </article>
    </section>
  )
}

export default JoinPage
