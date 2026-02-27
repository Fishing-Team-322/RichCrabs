import { Link } from 'react-router-dom'
import useAuth from '../../hooks/useAuth'
import { routes } from '../../app/router/routeMap'
import { useTranslation } from 'react-i18next'
import LanguageSwitcher from '../LanguageSwitcher'

const Header = () => {
  const { profile, signOut, isLoading } = useAuth()
  const { t } = useTranslation()

  return (
    <header className="topbar">
      <strong>{t('header.title')}</strong>
      <div className="accountBlock">
        <LanguageSwitcher />
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
