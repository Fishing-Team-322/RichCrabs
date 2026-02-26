import { apiFetch } from './api'
import { AuthResponse } from '../types/userTypes.ts'

export const authApi = {
  login: (email: string, password: string) =>
    apiFetch<AuthResponse>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),

  register: (name: string, email: string, password: string) =>
    apiFetch<AuthResponse>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ name, email, password }),
    }),

  getProfile: () => apiFetch<AuthResponse>('/api/user/profile'),
}