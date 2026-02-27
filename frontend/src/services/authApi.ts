import { apiFetch } from './api'
import type {
  AuthResponseDto,
  LoginRequestDto,
  RegisterRequestDto,
} from '../types/auth.types'

export const authApi = {
  csrf: () => apiFetch<{ token: string }>('/api/v1/auth/csrf'),

  login: (payload: LoginRequestDto) =>
    apiFetch<AuthResponseDto>('/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  register: (payload: RegisterRequestDto) =>
    apiFetch<AuthResponseDto>('/api/v1/auth/register', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  logout: () =>
    apiFetch<void>('/api/v1/auth/logout', {
      method: 'POST',
    }),
}
