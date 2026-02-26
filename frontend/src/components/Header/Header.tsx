import { Link } from 'react-router-dom'
import useAuth from '../../hooks/useAuth'
import { routes } from '../../app/router/routeMap'

const Header = () => {
  const { profile, signOut, isLoading } = useAuth()

  return (
    <header className="topbar">
      <strong>Внутренние разделы</strong>
      <div className="accountBlock">
        {profile ? (
          <>
            <div className="accountMeta">
              <span className="accountName">{profile.name}</span>
              <span className="accountEmail">{profile.email}</span>
            </div>
            <Link className="accountAction" to={routes.profile}>
              Профиль
            </Link>
            <button className="accountAction" onClick={() => void signOut()} disabled={isLoading}>
              Выйти
            </button>
          </>
        ) : (
          <Link className="accountAction" to={routes.authLogin}>
            Войти
          </Link>
        )}
      </div>
    </header>
  )
}

export default Header
