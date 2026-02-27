import type {
  ApiEnvelope,
  BusinessErrorDto,
  HttpErrorDto,
} from '../types/http.types'

const API_BASE = import.meta.env.VITE_API_BASE_URL || ''

const ACCESS_TOKEN_KEY = 'token'
const REFRESH_TOKEN_KEY = 'refresh_token'

export class AppError extends Error {
  status: number
  code?: string
  details?: unknown

  constructor({ message, status, code, details }: HttpErrorDto) {
    super(message)
    this.name = 'AppError'
    this.status = status
    this.code = code
    this.details = details
  }
}

let refreshPromise: Promise<string | null> | null = null

const getAccessToken = (): string => localStorage.getItem(ACCESS_TOKEN_KEY) || ''
const getRefreshToken = (): string => localStorage.getItem(REFRESH_TOKEN_KEY) || ''

export const setAuthTokens = (accessToken: string, refreshToken?: string) => {
  localStorage.setItem(ACCESS_TOKEN_KEY, accessToken)
  if (refreshToken) {
    localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken)
  }
}

export const clearAuthTokens = () => {
  localStorage.removeItem(ACCESS_TOKEN_KEY)
  localStorage.removeItem(REFRESH_TOKEN_KEY)
}

const parseErrorPayload = async (response: Response): Promise<HttpErrorDto> => {
  const fallback: HttpErrorDto = {
    message: 'Unexpected error',
    status: response.status,
  }

  const body = await response.text().catch(() => '')
  if (!body) {
    return fallback
  }

  try {
    const json = JSON.parse(body) as Partial<BusinessErrorDto & HttpErrorDto>
    return {
      message: json.message || fallback.message,
      status: response.status,
      code: json.code,
      details: json.details,
    }
  } catch {
    return {
      ...fallback,
      message: body.slice(0, 180),
    }
  }
}

const normalizeResponse = <T>(payload: T | ApiEnvelope<T>): T => {
  if (payload && typeof payload === 'object' && 'data' in payload) {
    const envelope = payload as ApiEnvelope<T>
    if (envelope.error) {
      throw new AppError({
        message: envelope.error.message,
        code: envelope.error.code,
        details: envelope.error.details,
        status: 400,
      })
    }
    return envelope.data
  }

  return payload as T
}

const extractAccessToken = (payload: unknown): string | null => {
  if (!payload || typeof payload !== 'object') return null

  const p = payload as Record<string, unknown>
  const token = p.accessToken || p.token
  return typeof token === 'string' ? token : null
}

const extractRefreshToken = (payload: unknown): string | undefined => {
  if (!payload || typeof payload !== 'object') return undefined

  const p = payload as Record<string, unknown>
  return typeof p.refreshToken === 'string' ? p.refreshToken : undefined
}

const reauth = async (): Promise<string | null> => {
  const refreshToken = getRefreshToken()
  if (!refreshToken) return null

  const tryRefresh = async (endpoint: string): Promise<string | null> => {
    const response = await fetch(`${API_BASE}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    })

    if (!response.ok) {
      return null
    }

    const payload = normalizeResponse(await response.json())
    const accessToken = extractAccessToken(payload)
    if (!accessToken) {
      return null
    }

    const nextRefreshToken = extractRefreshToken(payload)
    setAuthTokens(accessToken, nextRefreshToken)
    return accessToken
  }

  return (await tryRefresh('/api/auth/refresh')) || tryRefresh('/api/auth/reauth')
}

const getRefreshedToken = async (): Promise<string | null> => {
  if (!refreshPromise) {
    refreshPromise = reauth().finally(() => {
      refreshPromise = null
    })
  }

  return refreshPromise
}

export async function apiFetch<T>(
  endpoint: string,
  options: RequestInit = {},
  withReauth = true
): Promise<T> {
  const token = getAccessToken()
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...(token && { Authorization: `Bearer ${token}` }),
    ...options.headers,
  }

  const response = await fetch(`${API_BASE}${endpoint}`, { ...options, headers })

  if (response.status === 401 && withReauth) {
    const refreshedToken = await getRefreshedToken()

    if (refreshedToken) {
      return apiFetch<T>(endpoint, options, false)
    }

    clearAuthTokens()
    throw new AppError({
      message: 'Session expired. Please sign in again.',
      status: 401,
      code: 'AUTH_EXPIRED',
    })
  }

  if (!response.ok) {
    throw new AppError(await parseErrorPayload(response))
  }

  if (response.status === 204) {
    return undefined as T
  }

  const json = await response.json()
  return normalizeResponse<T>(json)
}
