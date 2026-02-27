import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { routes } from '../../app/router/routeMap'
import { joinApi } from '../../services/joinApi'
import { AppError } from '../../services/api'
import { playerSession } from '../../services/playerSession'
import '../rooms/rooms.css'

const toErrorMessage = (error: unknown) => {
  if (!(error instanceof AppError)) {
    return 'Не удалось выполнить вход по invite-ссылке.'
  }

  const code = (error.code || '').toLowerCase()
  const message = error.message.toLowerCase()

  if (code.includes('expired') || message.includes('expired') || message.includes('ист')) {
    return 'Invite-token истек. Попросите host отправить новую ссылку.'
  }

  if (code.includes('closed') || message.includes('closed') || message.includes('finish')) {
    return 'Комната закрыта и больше не принимает игроков.'
  }

  if (code.includes('limit') || message.includes('limit') || message.includes('full')) {
    return 'Лимит игроков достигнут. Вход невозможен.'
  }

  return 'Invite-token недействителен или уже использован.'
}

const InviteJoinPage = () => {
  const { token = '' } = useParams()
  const navigate = useNavigate()
  const [error, setError] = useState('')

  useEffect(() => {
    if (!token) {
      setError('Invite-token не указан в ссылке.')
      return
    }

    const playerName = playerSession.getPlayerName() || `Guest-${Math.floor(Math.random() * 1000)}`

    const run = async () => {
      try {
        const response = await joinApi.joinByInviteToken(token, playerName)
        playerSession.saveToken(response.token)
        playerSession.savePlayerName(playerName)
        navigate(routes.quizRuntime.replace(':roomId', response.gameId), { replace: true })
      } catch (joinError: unknown) {
        setError(toErrorMessage(joinError))
      }
    }

    void run()
  }, [navigate, token])

  return (
    <section className="roomsPage">
      <article className="pageCard">
        <h1>Вход по invite-ссылке</h1>
        {error ? <div className="roomError">{error}</div> : <p>Проверяем invite-token и подключаем к игре…</p>}
      </article>
    </section>
  )
}

export default InviteJoinPage
