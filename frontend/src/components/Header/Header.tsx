import { Link } from 'react-router-dom'
import useAuth from '../../hooks/useAuth'
import { routes } from '../../app/router/routeMap'
import { useTranslation } from 'react-i18next'

const Header = () => {
  const { profile, signOut, isLoading } = useAuth()
  const { t } = useTranslation()

  return (
    <header className="topbar">
      <div className="topbarMain">
        <Link className="topbarHomeLink" to={routes.home}>
          RichCrabs
        </Link>
        <span className="topbarSubtitle">Внутренние разделы</span>
      </div>

      <div className="accountBlock">
        {profile ? (
          <>
            <div className="accountMeta">
              <span className="accountName">{profile.displayName}</span>
              <span className="accountEmail">{profile.email}</span>
            </div>
            <Link className="accountAction" to={routes.profile}>
              {t('common.profile')}
            </Link>
            <button className="accountAction" onClick={() => void signOut()} disabled={isLoading}>
              {t('common.logout')}
            </button>
          </>
        ) : (
          <Link className="accountAction" to={routes.authLogin}>
            {t('common.login')}
          </Link>
        )}
      </div>
    </header>
  )
}

export default Header
