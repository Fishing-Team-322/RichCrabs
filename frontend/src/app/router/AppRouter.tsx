import React, { Suspense } from 'react'
import { Link, Navigate, NavLink, Outlet, Route, Routes, matchPath, useLocation } from 'react-router-dom'
import { useAppSelector } from '../../store/hooks'
import { routes } from './routeMap'
import './router.css'

interface AppPageProps {
  title: string
  description: string
}

const AppPage: React.FC<AppPageProps> = ({ title, description }) => (
  <section className="pageCard">
    <h1>{title}</h1>
    <p>{description}</p>
  </section>
)

const LoadingFallback: React.FC = () => <div className="routeState">Загрузка роутов...</div>

const NotFoundPage: React.FC = () => (
  <div className="routeState">
    <h1>404</h1>
    <p>Страница не найдена.</p>
    <Link to={routes.home}>Вернуться на главную</Link>
  </div>
)

const PublicGuard: React.FC = () => {
  const isAuthenticated = useAppSelector((state) => Boolean(state.user.currentUser))

  if (isAuthenticated) {
    return <Navigate to={routes.profile} replace />
  }

  return <Outlet />
}

const PrivateGuard: React.FC = () => {
  const isAuthenticated = useAppSelector((state) => Boolean(state.user.currentUser))

  if (!isAuthenticated) {
    return <Navigate to={routes.authLogin} replace />
  }

  return <Outlet />
}

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
  { pattern: routes.adminDashboard, label: 'Панель администратора' },
  { pattern: routes.adminSecurity, label: 'Безопасность' },
]

const InternalLayout: React.FC = () => {
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
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => (isActive ? 'navItem active' : 'navItem')}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>

      <div className="contentWrap">
        <header className="topbar">
          <strong>Внутренние разделы</strong>
          <div className="breadcrumbs">
            <Link to={routes.home}>Главная</Link>
            {breadcrumbs.map((crumb) => (
              <span key={crumb.pattern}>/ {crumb.label}</span>
            ))}
          </div>
        </header>
        <main className="contentMain">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

const AppRouter: React.FC = () => {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <Routes>
        <Route path={routes.home} element={<AppPage title="Главная" description="Публичная главная страница." />} />
        <Route path={routes.join} element={<AppPage title="Join" description="Ввод PIN или invite-кода." />} />
        <Route path={routes.invite} element={<AppPage title="Invite" description="Прямой вход по invite-токену." />} />

        <Route element={<PublicGuard />}>
          <Route path={routes.authLogin} element={<AppPage title="Вход" description="Страница авторизации." />} />
          <Route path={routes.authRegister} element={<AppPage title="Регистрация" description="Страница регистрации." />} />
        </Route>

        <Route element={<PrivateGuard />}>
          <Route element={<InternalLayout />}>
            <Route path={routes.quizzes} element={<AppPage title="Квизы" description="Список доступных квизов." />} />
            <Route path={routes.quizzesNew} element={<AppPage title="Новый квиз" description="Создание нового квиза." />} />
            <Route
              path={routes.quizzesEdit}
              element={<AppPage title="Редактирование квиза" description="Редактирование выбранного квиза." />}
            />
            <Route
              path={routes.quizzesPublish}
              element={<AppPage title="Публикация квиза" description="Публикация и настройки доступа." />}
            />
            <Route path={routes.rooms} element={<AppPage title="Комнаты" description="Список игровых комнат." />} />
            <Route path={routes.roomsNew} element={<AppPage title="Новая комната" description="Создание игровой комнаты." />} />
            <Route path={routes.roomDetails} element={<AppPage title="Комната" description="Детали игровой комнаты." />} />
            <Route path={routes.quizRuntime} element={<AppPage title="Игра" description="Игровой runtime комнаты." />} />
            <Route path={routes.profile} element={<AppPage title="Профиль" description="Управление профилем пользователя." />} />
            <Route
              path={routes.subscriptions}
              element={<AppPage title="Подписки" description="Управление подписками и тарифами." />}
            />
            <Route path={routes.bots} element={<AppPage title="Боты" description="Интеграции с ботами." />} />
            <Route
              path={routes.adminDashboard}
              element={<AppPage title="Admin Dashboard" description="Административная панель." />}
            />
            <Route
              path={routes.adminSecurity}
              element={<AppPage title="Admin Security" description="Раздел безопасности админки." />}
            />
          </Route>
        </Route>

        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </Suspense>
  )
}

export default AppRouter
