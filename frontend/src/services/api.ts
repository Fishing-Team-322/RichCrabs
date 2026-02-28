import type {
  ApiEnvelope,
  BusinessErrorDto,
  HttpErrorDto,
} from '../types/http.types'

const API_BASE = import.meta.env.VITE_API_BASE_URL || ''
const CSRF_ENDPOINT = '/api/v1/auth/csrf'
const CSRF_COOKIE_NAME = import.meta.env.VITE_CSRF_COOKIE_NAME || 'XSRF-TOKEN'
const CSRF_HEADER_NAME = import.meta.env.VITE_CSRF_HEADER_NAME || 'X-XSRF-TOKEN'

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

let csrfPromise: Promise<string | null> | null = null

export const clearAuthTokens = () => {
  localStorage.removeItem('token')
  localStorage.removeItem('refresh_token')
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

const getCookieValue = (name: string): string | null => {
  if (typeof document === 'undefined') return null

  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = document.cookie.match(new RegExp(`(?:^|; )${escaped}=([^;]*)`))
  return match ? decodeURIComponent(match[1]) : null
}

const loadCsrfToken = async (): Promise<string | null> => {
  const existingToken = getCookieValue(CSRF_COOKIE_NAME)
  if (existingToken) return existingToken

  const response = await fetch(`${API_BASE}${CSRF_ENDPOINT}`, {
    method: 'GET',
    credentials: 'include',
  })

  if (!response.ok) {
    return null
  }

  const payload = normalizeResponse(await response.json()) as { token?: string }
  return payload.token || getCookieValue(CSRF_COOKIE_NAME)
}

const getCsrfToken = async (): Promise<string | null> => {
  if (!csrfPromise) {
    csrfPromise = loadCsrfToken().finally(() => {
      csrfPromise = null
    })
  }

  return csrfPromise
}

const isStateChangingRequest = (method?: string): boolean => {
  const normalized = (method || 'GET').toUpperCase()
  return normalized !== 'GET' && normalized !== 'HEAD' && normalized !== 'OPTIONS'
}

export async function apiFetch<T>(
  endpoint: string,
  options: RequestInit = {},
  withCsrfRetry = true
): Promise<T> {
  const method = (options.method || 'GET').toUpperCase()
  const headers: Record<string, string> = {
    ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    ...(options.headers as Record<string, string> | undefined),
  }

  if (isStateChangingRequest(method)) {
    const csrfToken = await getCsrfToken()
    if (csrfToken) {
      headers[CSRF_HEADER_NAME] = csrfToken
    }
  }

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    method,
    credentials: 'include',
    headers,
  })

  if (response.status === 403 && withCsrfRetry && isStateChangingRequest(method)) {
    csrfPromise = null
    const nextCsrfToken = await getCsrfToken()
    if (nextCsrfToken) {
      return apiFetch<T>(endpoint, options, false)
    }
  }

  if (response.status === 401) {
    clearAuthTokens()
  }

  if (!response.ok) {
    throw new AppError(await parseErrorPayload(response))
  }

  if (response.status === 204) {
    return undefined as T
  }

  try {
    const rawBody = await response.text()
    if (!rawBody) {
      return undefined as T
    }

    const parsedBody = JSON.parse(rawBody) as T | ApiEnvelope<T>
    return normalizeResponse<T>(parsedBody)
  } catch {
    return undefined as T
  }
}
