import { Link, useParams } from 'react-router-dom'
import { routes } from '../../app/router/routeMap'
import { playerSession } from '../../services/playerSession'
import '../rooms/rooms.css'

const RuntimePage = () => {
  const { roomId = '' } = useParams()
  const token = playerSession.getToken()

  return (
    <section className="roomsPage">
      <article className="pageCard roomForm">
        <h1>Игровой экран</h1>
        <div className="roomMeta">Комната: {roomId}</div>
        <div className="roomMeta">Player-token: {token ? 'сохранен в sessionStorage' : 'не найден'}</div>
        {!token && (
          <div className="roomError">
            Сессия игрока не найдена. Выполните вход через <Link to={routes.join}>страницу join</Link>.
          </div>
        )}
      </article>
    </section>
  )
}

export default RuntimePage
