import { apiFetch } from './api'
import type { JoinRoomRequestDto, JoinRoomResponseDto } from '../types/room.types'

const GAMES_BASE = '/api/v1/games'
const INVITES_BASE = '/api/v1/invites'

const mapJoinResponse = (payload: {
  joinTicket: string
  roomPin?: string
  playerId: string
}): JoinRoomResponseDto => ({
  token: payload.joinTicket,
  gameId: payload.roomPin || '',
  playerId: payload.playerId,
})

export const joinApi = {
  joinRoom: (payload: JoinRoomRequestDto) => {
    if (payload.pin) {
      return apiFetch<{ joinTicket: string; roomPin?: string; playerId: string }>(
        `${GAMES_BASE}/${encodeURIComponent(payload.pin)}/join`,
        {
          method: 'POST',
          body: JSON.stringify({ name: payload.playerName }),
        },
      ).then(mapJoinResponse)
    }

    if (payload.inviteToken) {
      return apiFetch<{ joinTicket: string; roomPin?: string; playerId: string }>(
        `${INVITES_BASE}/${encodeURIComponent(payload.inviteToken)}/join`,
        {
          method: 'POST',
          body: JSON.stringify({ name: payload.playerName }),
        },
      ).then(mapJoinResponse)
    }

    throw new Error('Для входа в комнату нужен PIN или invite token.')
  },

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
