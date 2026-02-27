import { apiFetch } from './api'
import type { PasswordChangeDto, SessionDto, UpdateProfileDto, UserDto } from '../types/auth.types'

export const profileApi = {
  getProfile: () => apiFetch<UserDto>('/api/user/profile'),
  updateProfile: (payload: UpdateProfileDto) =>
    apiFetch<UserDto>('/api/user/profile', {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
  changePassword: (payload: PasswordChangeDto) =>
    apiFetch<void>('/api/user/profile/password', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  getSessions: () => apiFetch<SessionDto[]>('/api/user/profile/sessions'),
}
