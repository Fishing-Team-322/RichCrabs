import { apiFetch } from './api'
import type { PasswordChangeDto, SessionDto, UpdateProfileDto, UserDto } from '../types/auth.types'

export const profileApi = {
  getProfile: () => apiFetch<UserDto>('/api/v1/me'),
  updateProfile: (payload: UpdateProfileDto) =>
    apiFetch<UserDto>('/api/v1/me', {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
  changePassword: (payload: PasswordChangeDto) =>
    apiFetch<void>('/api/v1/me/password', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  getSessions: () => apiFetch<SessionDto[]>('/api/v1/me/sessions'),
}
