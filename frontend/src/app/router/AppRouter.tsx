import React, { Suspense, useEffect } from 'react'
import { Link, Route, Routes } from 'react-router-dom'
import { useAppDispatch } from '../../store/hooks'
import { restoreSession } from '../../store/slices'
import Layout from '../../components/Layout'
import AuthGuard from './guards/AuthGuard'
import GuestGuard from './guards/GuestGuard'
import {
  AdminDashboard,
  AdminLayout,
  AdminSecurity,
  CreateRoom,
  HomePage,
  InviteJoinPage,
  JoinPage,
  Login,
  OpenGames,
  Profile,
  QuizCreate,
  QuizEdit,
  QuizPublish,
  QuizzesList,
  Register,
  RoomDetails,
  RuntimePage,
  Subscriptions,
  TelegramBots,
} from './lazyPages'
import { routes } from './routeMap'
import './router.css'

const LoadingFallback: React.FC = () => <div className="routeState">Загрузка роутов...</div>

const NotFoundPage: React.FC = () => (
  <div className="routeState">
    <h1>404</h1>
    <p>Страница не найдена.</p>
    <Link to={routes.home}>Вернуться на главную</Link>
  </div>
)

const AppRouter: React.FC = () => {
  const dispatch = useAppDispatch()

  useEffect(() => {
    void dispatch(restoreSession())
  }, [dispatch])

  return (
    <Suspense fallback={<LoadingFallback />}>
      <Routes>
        <Route path={routes.home} element={<HomePage />} />
        <Route path={routes.join} element={<JoinPage />} />
        <Route path={routes.invite} element={<InviteJoinPage />} />
        <Route path={routes.quizRuntime} element={<RuntimePage />} />

        <Route element={<GuestGuard />}>
          <Route path={routes.authLogin} element={<Login />} />
          <Route path={routes.authRegister} element={<Register />} />
        </Route>

        <Route element={<AuthGuard />}>
          <Route element={<Layout />}>
            <Route path={routes.quizzes} element={<QuizzesList />} />
            <Route path={routes.quizzesNew} element={<QuizCreate />} />
            <Route path={routes.quizzesEdit} element={<QuizEdit />} />
            <Route path={routes.quizzesPublish} element={<QuizPublish />} />
            <Route path={routes.rooms} element={<OpenGames />} />
            <Route path={routes.roomsNew} element={<CreateRoom />} />
            <Route path={routes.roomDetails} element={<RoomDetails />} />
            <Route path={routes.profile} element={<Profile />} />
            <Route path={routes.subscriptions} element={<Subscriptions />} />
            <Route path={routes.bots} element={<TelegramBots />} />
          </Route>

          <Route element={<AdminLayout />}>
            <Route path={routes.adminDashboard} element={<AdminDashboard />} />
            <Route path={routes.adminSecurity} element={<AdminSecurity />} />
          </Route>
        </Route>

        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </Suspense>
  )
}

export default AppRouter
