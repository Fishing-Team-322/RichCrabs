import { apiFetch } from './api'
import type { UserDto } from '../types/auth.types'

export const profileApi = {
  getProfile: () => apiFetch<UserDto>('/api/user/profile'),
}
