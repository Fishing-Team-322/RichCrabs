import { memo, useCallback, useEffect, useState, type CSSProperties, type UIEvent } from 'react'
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

const VIRTUALIZATION_THRESHOLD = 24
const CARD_HEIGHT = 190
const VIEWPORT_HEIGHT = 620

const RoomCard = memo(({ room }: { room: RoomSummaryDto }) => (
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

const OpenGames = () => {
  const [status, setStatus] = useState<RoomStatus | 'all'>('all')
  const [rooms, setRooms] = useState<RoomSummaryDto[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [scrollTop, setScrollTop] = useState(0)
  const [columns, setColumns] = useState(3)

  const loadRooms = useCallback(async () => {
    try {
      const response = await roomsApi.list({ status })
      setRooms(response.rooms)
      setError('')
    } catch (apiError: unknown) {
      setError(apiError instanceof Error ? apiError.message : 'Не удалось получить список комнат.')
    } finally {
      setLoading(false)
    }
  }, [status])

  useEffect(() => {
    void loadRooms()
  }, [loadRooms])

  useInterval(() => {
    void loadRooms()
  }, 5000)


  useEffect(() => {
    const updateColumns = () => {
      if (window.innerWidth < 760) {
        setColumns(1)
        return
      }
      if (window.innerWidth < 1024) {
        setColumns(2)
        return
      }
      setColumns(3)
    }

    updateColumns()
    window.addEventListener('resize', updateColumns)
    return () => window.removeEventListener('resize', updateColumns)
  }, [])

  const virtualized = rooms.length >= VIRTUALIZATION_THRESHOLD
  const totalRows = Math.ceil(rooms.length / columns)
  const startRow = Math.floor(scrollTop / CARD_HEIGHT)
  const visibleRows = Math.ceil(VIEWPORT_HEIGHT / CARD_HEIGHT) + 2
  const endRow = Math.min(totalRows, startRow + visibleRows)
  const startIndex = startRow * columns
  const endIndex = Math.min(rooms.length, endRow * columns)
  const visibleRooms = virtualized ? rooms.slice(startIndex, endIndex) : rooms
  const topSpacerHeight = virtualized ? startRow * CARD_HEIGHT : 0
  const bottomSpacerHeight = virtualized ? Math.max(0, (totalRows - endRow) * CARD_HEIGHT) : 0

  const onScroll = useCallback((event: UIEvent<HTMLDivElement>) => {
    setScrollTop(event.currentTarget.scrollTop)
  }, [])

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

      {rooms.length === 0 ? (
        <article className="pageCard">{loading ? 'Загрузка комнат...' : 'Подходящих комнат не найдено.'}</article>
      ) : (
        <div className="roomsVirtualized" onScroll={onScroll} style={virtualized ? { maxHeight: VIEWPORT_HEIGHT, overflowY: 'auto' } : undefined}>
          {topSpacerHeight > 0 ? <div style={{ height: topSpacerHeight }} aria-hidden="true" /> : null}
          <div className={`roomsGrid ${virtualized ? 'is-virtualized' : ''}`} style={virtualized ? ({ ['--rooms-columns' as string]: String(columns) } as CSSProperties) : undefined}>
            {visibleRooms.map((room) => (
              <RoomCard room={room} key={room.id} />
            ))}
          </div>
          {bottomSpacerHeight > 0 ? <div style={{ height: bottomSpacerHeight }} aria-hidden="true" /> : null}
        </div>
      )}
    </section>
  )
}

export default OpenGames
