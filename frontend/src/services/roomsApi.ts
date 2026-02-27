import { apiFetch } from './api'
import type {
  CreateRoomRequestDto,
  GameDto,
  ListRoomsParams,
  RoomDetailsDto,
  RoomStateDto,
  RoomsListResponseDto,
} from '../types/room.types'

const ROOMS_BASE = '/api/rooms'

const queryList = (params: ListRoomsParams = {}): string => {
  const search = new URLSearchParams()
  if (params.status && params.status !== 'all') {
    search.set('status', params.status)
  }

  const raw = search.toString()
  return raw ? `?${raw}` : ''
}

export const roomsApi = {
  create: (payload: CreateRoomRequestDto) =>
    apiFetch<RoomDetailsDto>(ROOMS_BASE, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  list: (params: ListRoomsParams = {}) => apiFetch<RoomsListResponseDto>(`${ROOMS_BASE}${queryList(params)}`),

  open: (roomId: string) =>
    apiFetch<RoomDetailsDto>(`${ROOMS_BASE}/${encodeURIComponent(roomId)}/open`, {
      method: 'POST',
    }),

  pause: (roomId: string) =>
    apiFetch<RoomDetailsDto>(`${ROOMS_BASE}/${encodeURIComponent(roomId)}/pause`, {
      method: 'POST',
    }),

  details: (roomId: string) => apiFetch<RoomDetailsDto>(`${ROOMS_BASE}/${encodeURIComponent(roomId)}`),

  close: (roomId: string) =>
    apiFetch<void>(`${ROOMS_BASE}/${encodeURIComponent(roomId)}/close`, {
      method: 'POST',
    }),

  subscribeRoomDetails: (roomId: string, onUpdate: (room: RoomDetailsDto) => void, intervalMs = 5000) => {
    let disposed = false

    const load = async () => {
      try {
        const room = await roomsApi.details(roomId)
        if (!disposed) {
          onUpdate(room)
        }
      } catch {
        // polling should be resilient; next interval can retry
      }
    }

    void load()
    const timer = window.setInterval(() => {
      void load()
    }, intervalMs)

    return () => {
      disposed = true
      window.clearInterval(timer)
    }
  },

  getOpenRooms: () => apiFetch<GameDto[]>('/api/games/open'),
  getRoomState: (roomId: string) =>
    apiFetch<RoomStateDto>(`/api/games/${encodeURIComponent(roomId)}/state`),
}
