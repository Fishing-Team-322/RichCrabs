import { apiFetch } from './api'

export interface ServiceHealthDto {
  status: string
  gateway?: string
  requestId?: string
}

export interface SessionStatusDto {
  authenticated: boolean
  role?: string
  userId?: string
  roomId?: string
}

export const serviceApi = {
  health: () => apiFetch<ServiceHealthDto>('/api/v1/healthz'),
  session: () => apiFetch<SessionStatusDto>('/api/v1/session'),
}

