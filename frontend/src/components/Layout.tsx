import { useMemo } from 'react'
import { useAppSelector } from '../store/hooks'
import { selectIsAdmin } from '../store/slices/authSlice'
import { Link, NavLink, Outlet } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import Header from './Header/Header'
import { routes } from '../app/router/routeMap'

const Layout = () => {
  const { t } = useTranslation()
  const isAdmin = useAppSelector(selectIsAdmin)

  const internalNavigation = useMemo(
    () => [
      { to: routes.quizzes, label: 'Квизы' },
      { to: routes.rooms, label: 'Комнаты' },
      { to: routes.profile, label: t('common.profile') },
      { to: routes.subscriptions, label: 'Подписки' },
      { to: routes.bots, label: 'Боты' },
      ...(isAdmin ? [{ to: routes.adminDashboard, label: 'Админ' }] : []),
    ],
    [isAdmin, t],
  )

  return (
    <div className="appShell">
      <aside className="sidebarNav">
        <Link to={routes.home} className="brandBlock">
          RichCrabs
        </Link>
        <nav>
          {internalNavigation.map((item) => (
            <NavLink key={item.to} to={item.to} className={({ isActive }) => (isActive ? 'navItem active' : 'navItem')}>
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>

      <div className="contentWrap">
        <Header />
        <main className="contentMain">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

export default Layout
