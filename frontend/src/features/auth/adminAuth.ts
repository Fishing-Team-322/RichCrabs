import type { UserDto } from '../../types/auth.types'

export const ADMIN_LOGIN = '55555'
export const ADMIN_PASSWORD = '55555'
const ADMIN_SESSION_KEY = 'richcrabs-admin-session'

export const createAdminProfile = (): UserDto => ({
  id: 'admin-local',
  displayName: 'Administrator',
  email: ADMIN_LOGIN,
  gamesPlayed: 0,
  wins: 0,
  subscription: 'pro',
})

export const matchesAdminCredentials = (login: string, password: string): boolean =>
  login === ADMIN_LOGIN && password === ADMIN_PASSWORD

export const persistAdminSession = () => {
  localStorage.setItem(ADMIN_SESSION_KEY, '1')
}

export const clearAdminSession = () => {
  localStorage.removeItem(ADMIN_SESSION_KEY)
}

export const hasPersistedAdminSession = (): boolean => localStorage.getItem(ADMIN_SESSION_KEY) === '1'

export const isAdminProfile = (profile: UserDto | null): boolean => profile?.id === 'admin-local'
