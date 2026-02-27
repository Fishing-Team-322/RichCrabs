import { apiFetch } from './api'
import type { JoinRoomRequestDto, JoinRoomResponseDto } from '../types/room.types'

const JOIN_ENDPOINT = '/api/games/join'

export const joinApi = {
  joinRoom: (payload: JoinRoomRequestDto) =>
    apiFetch<JoinRoomResponseDto>(JOIN_ENDPOINT, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  joinByPin: (pin: string, playerName: string) =>
    joinApi.joinRoom({
      pin,
      playerName,
    }),

  joinByInviteToken: (inviteToken: string, playerName: string) =>
    joinApi.joinRoom({
      inviteToken,
      playerName,
    }),
}
