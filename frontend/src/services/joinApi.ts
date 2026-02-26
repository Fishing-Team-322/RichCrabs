import { apiFetch } from './api'
import type { JoinRoomRequestDto, JoinRoomResponseDto } from '../types/room.types'

export const joinApi = {
  joinRoom: (payload: JoinRoomRequestDto) =>
    apiFetch<JoinRoomResponseDto>('/api/games/join', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
}
