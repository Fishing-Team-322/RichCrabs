import { ApiError } from '../types/apiTypes.ts'

const API_BASE = import.meta.env.VITE_API_BASE_URL || ''

export async function apiFetch<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const token = localStorage.getItem('token')
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...(token && { Authorization: `Bearer ${token}` }),
    ...options.headers,
  }

  const response = await fetch(API_BASE + endpoint, { ...options, headers })
  if (!response.ok) {
    const error: ApiError = await response.json().catch(() => ({
      message: 'Unknown error',
      status: response.status,
    }))
    throw error
  }
  return response.json()
}