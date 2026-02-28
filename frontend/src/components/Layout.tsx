import { useMemo } from 'react'
import { Link, Outlet, matchPath, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import Header from './Header/Header'
import { routes } from '../app/router/routeMap'

const Layout = () => {
  const location = useLocation()
  const { t } = useTranslation()

  const breadcrumbMap = useMemo(
    () => [
      { pattern: routes.quizzes, label: 'Квизы' },
      { pattern: routes.quizzesNew, label: 'Новый квиз' },
      { pattern: routes.quizzesEdit, label: 'Редактирование квиза' },
      { pattern: routes.quizzesPublish, label: 'Публикация квиза' },
      { pattern: routes.rooms, label: 'Комнаты' },
      { pattern: routes.roomsNew, label: 'Новая комната' },
      { pattern: routes.roomDetails, label: 'Комната' },
      { pattern: routes.profile, label: t('common.profile') },
      { pattern: routes.subscriptions, label: 'Подписки' },
      { pattern: routes.bots, label: 'Боты' },
    ],
    [t],
  )

  const breadcrumbs = useMemo(
    () =>
      breadcrumbMap.filter((crumb) =>
        Boolean(matchPath({ path: crumb.pattern, end: true }, location.pathname)),
      ),
    [breadcrumbMap, location.pathname],
  )

  return (
    <div className="contentWrap">
      <Header />
      <div className="breadcrumbs">
        <Link to={routes.home}>{t('common.home')}</Link>
        {breadcrumbs.map((crumb) => (
          <span key={crumb.pattern}>/ {crumb.label}</span>
        ))}
      </div>
      <main className="contentMain">
        <Outlet />
      </main>
    </div>
  )
}

export default Layout
