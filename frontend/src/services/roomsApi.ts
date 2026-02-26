import { apiFetch } from './api'
import type { GameDto, RoomStateDto } from '../types/room.types'

export const roomsApi = {
  getOpenRooms: () => apiFetch<GameDto[]>('/api/games/open'),
  getRoomState: (roomId: string) =>
    apiFetch<RoomStateDto>(`/api/games/${encodeURIComponent(roomId)}/state`),
}
