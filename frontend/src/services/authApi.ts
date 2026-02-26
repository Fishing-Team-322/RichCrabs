import { apiFetch, setAuthTokens } from './api'
import type {
  AuthResponseDto,
  LoginRequestDto,
  RefreshResponseDto,
  RegisterRequestDto,
} from '../types/auth.types'

const applyTokensFromResponse = (response: AuthResponseDto | RefreshResponseDto) => {
  const accessToken = response.accessToken || response.token
  if (!accessToken) return
  setAuthTokens(accessToken, response.refreshToken)
}

export const authApi = {
  login: async (payload: LoginRequestDto) => {
    const response = await apiFetch<AuthResponseDto>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
    applyTokensFromResponse(response)
    return response
  },

  register: async (payload: RegisterRequestDto) => {
    const response = await apiFetch<AuthResponseDto>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
    applyTokensFromResponse(response)
    return response
  },

  refresh: async (refreshToken: string) => {
    const response = await apiFetch<RefreshResponseDto>(
      '/api/auth/refresh',
      {
        method: 'POST',
        body: JSON.stringify({ refreshToken }),
      },
      false
    )

    applyTokensFromResponse(response)
    return response
  },
}
