export const routes = {
  home: '/',
  authLogin: '/auth/login',
  authRegister: '/auth/register',
  quizzes: '/quizzes',
  quizzesNew: '/quizzes/new',
  quizzesEdit: '/quizzes/:quizId/edit',
  quizzesPublish: '/quizzes/:quizId/publish',
  rooms: '/rooms',
  roomsNew: '/rooms/new',
  roomDetails: '/rooms/:roomId',
  join: '/join',
  invite: '/invite/:token',
  quizRuntime: '/quiz/:roomId',
  profile: '/profile',
  subscriptions: '/subscriptions',
  bots: '/bots',
  adminDashboard: '/admin/dashboard',
  adminSecurity: '/admin/security',
} as const

export type RoutePath = (typeof routes)[keyof typeof routes]
