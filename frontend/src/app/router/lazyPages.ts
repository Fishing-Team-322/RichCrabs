import { lazy } from 'react'
import type { ComponentType } from 'react'

const createPreloadable = <TModule extends { default: ComponentType<any> }>(loader: () => Promise<TModule>) => {
  const Component = lazy(loader)

  return {
    Component,
    preload: loader,
  }
}

const home = createPreloadable(() => import('../../pages/Home/Home'))
const join = createPreloadable(() => import('../../pages/join/JoinPage'))
const inviteJoin = createPreloadable(() => import('../../pages/join/InviteJoinPage'))
const quizRuntime = createPreloadable(() => import('../../pages/Quiz/RuntimePage'))
const login = createPreloadable(() => import('../../pages/auth/Login'))
const register = createPreloadable(() => import('../../pages/auth/Register'))
const quizzesList = createPreloadable(() => import('../../pages/quizzes/QuizzesList'))
const quizCreate = createPreloadable(() => import('../../pages/quizzes/QuizCreate'))
const quizEdit = createPreloadable(() => import('../../pages/quizzes/QuizEdit'))
const quizPublish = createPreloadable(() => import('../../pages/quizzes/QuizPublish'))
const rooms = createPreloadable(() => import('../../pages/rooms/OpenGames'))
const createRoom = createPreloadable(() => import('../../pages/CreateRoom/CreateRoom'))
const roomDetails = createPreloadable(() => import('../../pages/rooms/RoomDetails'))
const profile = createPreloadable(() => import('../../pages/Profile/Profile'))
const subscriptions = createPreloadable(() => import('../../pages/Subscriptions/Subscriptions'))
const telegramBots = createPreloadable(() => import('../../pages/TelegramBots/TelegramBots'))
const adminDashboard = createPreloadable(() => import('../../pages/admin/Dashboard'))
const adminSecurity = createPreloadable(() => import('../../pages/admin/Security'))

export const HomePage = home.Component
export const JoinPage = join.Component
export const InviteJoinPage = inviteJoin.Component
export const RuntimePage = quizRuntime.Component
export const Login = login.Component
export const Register = register.Component
export const QuizzesList = quizzesList.Component
export const QuizCreate = quizCreate.Component
export const QuizEdit = quizEdit.Component
export const QuizPublish = quizPublish.Component
export const OpenGames = rooms.Component
export const CreateRoom = createRoom.Component
export const RoomDetails = roomDetails.Component
export const Profile = profile.Component
export const Subscriptions = subscriptions.Component
export const TelegramBots = telegramBots.Component
export const AdminDashboard = adminDashboard.Component
export const AdminSecurity = adminSecurity.Component

export const preloadJoinFlow = () => Promise.all([join.preload(), quizRuntime.preload()])
export const preloadQuizRuntime = () => quizRuntime.preload()
