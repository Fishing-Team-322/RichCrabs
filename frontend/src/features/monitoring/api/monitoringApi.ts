import type {
  Overview,
  RoomDetails,
  RoomsList,
  SecurityEventsResponse,
  SecurityOverview,
} from '../types'

const ADMIN_TOKEN_KEY = 'admin_token'

function getToken(): string {
  return localStorage.getItem(ADMIN_TOKEN_KEY) || ''
}

async function fetchJson<T>(url: string): Promise<T> {
  const token = getToken()
  const response = await fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })

  const text = await response.text().catch(() => '')
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${text.slice(0, 140)}`)
  }

  try {
    return JSON.parse(text) as T
  } catch {
    throw new Error(`Non-JSON response from ${url}: ${text.slice(0, 140)}`)
  }
}

export const monitoringApi = {
  overview: () => fetchJson<Overview>('/api/admin/api/overview'),
  rooms: () => fetchJson<RoomsList>('/api/admin/api/rooms'),
  room: (id: string) => fetchJson<RoomDetails>(`/api/admin/api/rooms/${encodeURIComponent(id)}`),
  securityOverview: () => fetchJson<SecurityOverview>('/api/admin/api/security/overview'),
  securityEvents: (limit = 40) =>
    fetchJson<SecurityEventsResponse>(`/api/admin/api/security/events?limit=${limit}`),
}
