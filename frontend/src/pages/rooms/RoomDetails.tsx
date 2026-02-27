import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { QRCodeSVG } from 'qrcode.react'
import { routes } from '../../app/router/routeMap'
import { roomsApi } from '../../services/roomsApi'
import type { RoomDetailsDto } from '../../types/room.types'
import './rooms.css'

const RoomDetails = () => {
  const { roomId = '' } = useParams()
  const [room, setRoom] = useState<RoomDetailsDto | null>(null)
  const [loading, setLoading] = useState(true)
  const [pendingAction, setPendingAction] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!roomId) return

    const unsubscribe = roomsApi.subscribeRoomDetails(roomId, (nextRoom) => {
      setRoom(nextRoom)
      setLoading(false)
    })

    return unsubscribe
  }, [roomId])

  const inviteLink = useMemo(() => {
    if (!room?.inviteLink) return ''
    if (/^https?:\/\//.test(room.inviteLink)) {
      return room.inviteLink
    }
    return `${window.location.origin}${room.inviteLink}`
  }, [room])

  const copyText = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setError('')
    } catch {
      setError('Не удалось скопировать в буфер обмена.')
    }
  }

  const runAction = async (action: 'start' | 'pause' | 'finish') => {
    if (!roomId) return

    setPendingAction(true)
    setError('')

    try {
      if (action === 'start') {
        const updated = await roomsApi.open(roomId)
        setRoom(updated)
      }
      if (action === 'pause') {
        const updated = await roomsApi.pause(roomId)
        setRoom(updated)
      }
      if (action === 'finish') {
        await roomsApi.close(roomId)
        const updated = await roomsApi.details(roomId)
        setRoom(updated)
      }
    } catch (apiError: unknown) {
      setError(apiError instanceof Error ? apiError.message : 'Действие host завершилось ошибкой.')
    } finally {
      setPendingAction(false)
    }
  }

  return (
    <section className="roomsPage">
      <div className="pageCard roomsHeader">
        <div>
          <h1>Карточка комнаты</h1>
          <p>Автоподписка на обновления статуса комнаты включена.</p>
        </div>
        <Link className="roomLink" to={routes.rooms}>
          К списку комнат
        </Link>
      </div>

      {error && <div className="roomError">{error}</div>}

      {!room ? (
        <div className="pageCard">{loading ? 'Загрузка карточки...' : 'Комната не найдена.'}</div>
      ) : (
        <article className="pageCard roomForm">
          <div className="roomInfoRow">
            <strong>{room.quizTitle}</strong>
            <span className={`roomStatus ${room.status}`}>{room.status}</span>
          </div>

          <div className="roomInfoRow">
            <strong>PIN:</strong> <code>{room.pin}</code>
            <button className="roomButton" onClick={() => void copyText(room.pin)}>
              Копировать PIN
            </button>
          </div>

          <div className="roomInfoRow">
            <strong>Invite-link:</strong>
            <a href={inviteLink}>{inviteLink}</a>
            <button className="roomButton" onClick={() => void copyText(inviteLink)}>
              Копировать ссылку
            </button>
          </div>

          <div className="roomMeta">
            Игроки: {room.playersCount}/{room.playerLimit} · Приватность: {room.settings.privacy}
          </div>


          {inviteLink && (
            <div className="roomQr">
              <QRCodeSVG value={inviteLink} size={168} includeMargin />
              <span className="roomMeta">QR для быстрого входа по invite-link</span>
            </div>
          )}
          <div className="roomMeta">
            Таймеры: lobby {room.settings.timers.lobbyTimerSec}s · question {room.settings.timers.questionTimerSec}s · reveal{' '}
            {room.settings.timers.answerRevealSec}s
          </div>

          {room.isHost && (
            <div className="roomsActions">
              <button className="roomButton primary" disabled={pendingAction} onClick={() => void runAction('start')}>
                Старт
              </button>
              <button className="roomButton" disabled={pendingAction} onClick={() => void runAction('pause')}>
                Пауза
              </button>
              <button className="roomButton" disabled={pendingAction} onClick={() => void runAction('finish')}>
                Завершить
              </button>
            </div>
          )}
        </article>
      )}
    </section>
  )
}

export default RoomDetails
