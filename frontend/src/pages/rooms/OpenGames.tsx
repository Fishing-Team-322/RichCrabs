import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { routes } from '../../app/router/routeMap'
import { useInterval } from '../../hooks/useInterval'
import { roomsApi } from '../../services/roomsApi'
import type { RoomStatus, RoomSummaryDto } from '../../types/room.types'
import './rooms.css'

const statusFilters: Array<{ label: string; value: RoomStatus | 'all' }> = [
  { label: 'Все', value: 'all' },
  { label: 'Ожидают', value: 'waiting' },
  { label: 'Активные', value: 'active' },
  { label: 'Пауза', value: 'paused' },
]

const OpenGames = () => {
  const [status, setStatus] = useState<RoomStatus | 'all'>('all')
  const [rooms, setRooms] = useState<RoomSummaryDto[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const loadRooms = async () => {
    try {
      const response = await roomsApi.list({ status })
      setRooms(response.rooms)
      setError('')
    } catch (apiError: unknown) {
      setError(apiError instanceof Error ? apiError.message : 'Не удалось получить список комнат.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadRooms()
  }, [status])

  useInterval(() => {
    void loadRooms()
  }, 5000)

  return (
    <section className="roomsPage">
      <div className="pageCard roomsHeader">
        <div>
          <h1>Открытые комнаты</h1>
          <p>Автообновление каждые 5 секунд: waiting/active/paused.</p>
        </div>
        <div className="roomsActions">
          <Link className="roomLink" to={routes.roomsNew}>
            Создать комнату
          </Link>
        </div>
      </div>

      <div className="pageCard roomsActions">
        {statusFilters.map((item) => (
          <button
            key={item.value}
            type="button"
            className={`roomButton ${status === item.value ? 'primary' : ''}`}
            onClick={() => setStatus(item.value)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {error && <div className="roomError">{error}</div>}

      <div className="roomsGrid">
        {rooms.length === 0 ? (
          <article className="pageCard">{loading ? 'Загрузка комнат...' : 'Подходящих комнат не найдено.'}</article>
        ) : (
          rooms.map((room) => (
            <article className="roomCard" key={room.id}>
              <strong>{room.quizTitle}</strong>
              <span className={`roomStatus ${room.status}`}>{room.status}</span>
              <div className="roomMeta">
                Игроки: {room.playersCount}/{room.playerLimit}
              </div>
              <div className="roomMeta">PIN: {room.pin}</div>
              <div className="roomsInline">
                <Link className="roomLink" to={routes.roomDetails.replace(':roomId', room.id)}>
                  Карточка комнаты
                </Link>
              </div>
            </article>
          ))
        )}
      </div>
    </section>
  )
}

export default OpenGames
