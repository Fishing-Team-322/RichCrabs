import { Link, NavLink, Outlet, matchPath, useLocation } from 'react-router-dom'
import Header from './Header/Header'
import { routes } from '../app/router/routeMap'

const internalNavigation = [
  { to: routes.quizzes, label: 'Квизы' },
  { to: routes.rooms, label: 'Комнаты' },
  { to: routes.profile, label: 'Профиль' },
  { to: routes.subscriptions, label: 'Подписки' },
  { to: routes.bots, label: 'Боты' },
  { to: routes.adminDashboard, label: 'Админ' },
]

const breadcrumbMap = [
  { pattern: routes.quizzes, label: 'Квизы' },
  { pattern: routes.quizzesNew, label: 'Новый квиз' },
  { pattern: routes.quizzesEdit, label: 'Редактирование квиза' },
  { pattern: routes.quizzesPublish, label: 'Публикация квиза' },
  { pattern: routes.rooms, label: 'Комнаты' },
  { pattern: routes.roomsNew, label: 'Новая комната' },
  { pattern: routes.roomDetails, label: 'Комната' },
  { pattern: routes.quizRuntime, label: 'Игра' },
  { pattern: routes.profile, label: 'Профиль' },
  { pattern: routes.subscriptions, label: 'Подписки' },
  { pattern: routes.bots, label: 'Боты' },
  { pattern: routes.adminDashboard, label: 'Админ дашборд' },
  { pattern: routes.adminSecurity, label: 'Админ безопасность' },
]

const Layout = () => {
  const location = useLocation()

  const breadcrumbs = breadcrumbMap.filter((crumb) =>
    Boolean(matchPath({ path: crumb.pattern, end: true }, location.pathname)),
  )

  return (
    <div className="appShell">
      <aside className="sidebarNav">
        <div className="brandBlock">RichCrabs</div>
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
        <div className="breadcrumbs">
          <Link to={routes.home}>Главная</Link>
          {breadcrumbs.map((crumb) => (
            <span key={crumb.pattern}>/ {crumb.label}</span>
          ))}
        </div>
        <main className="contentMain">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

export default Layout
