import { apiFetch } from './api'
import type {
  CreateRoomRequestDto,
  GameDto,
  ListRoomsParams,
  RoomDetailsDto,
  RoomStateDto,
  RoomsListResponseDto,
} from '../types/room.types'

const GAMES_BASE = '/api/v1/games'

const toRoomStatus = (state: string): RoomDetailsDto['status'] => {
  if (state === 'playing') return 'active'
  if (state === 'paused') return 'paused'
  if (state === 'finished') return 'finished'
  return 'waiting'
}

const mapStateToRoomDetails = (payload: {
  pin: string
  state: string
  players: Array<{ playerId: string; name: string }>
}): RoomDetailsDto => ({
  id: payload.pin,
  quizId: '',
  quizTitle: payload.pin,
  pin: payload.pin,
  inviteLink: `/invite/${payload.pin}`,
  status: toRoomStatus(payload.state),
  playersCount: payload.players.length,
  playerLimit: 100,
  hostId: '',
  updatedAt: new Date().toISOString(),
  isHost: true,
  settings: {
    playerLimit: 100,
    privacy: 'private',
    timers: {
      lobbyTimerSec: 30,
      questionTimerSec: 20,
      answerRevealSec: 5,
    },
  },
  players: payload.players.map((player, index) => ({
    id: player.playerId,
    name: player.name,
    team: index % 2 === 0 ? 'A' : 'B',
  })),
})

export const roomsApi = {
  create: (payload: CreateRoomRequestDto) =>
    apiFetch<{ pin: string; inviteUrl: string }>(GAMES_BASE, {
      method: 'POST',
      body: JSON.stringify({ ownerUserId: '', quizId: payload.quizId, title: `Quiz ${payload.quizId}` }),
    }).then((res): RoomDetailsDto => ({
      ...mapStateToRoomDetails({ pin: res.pin, state: 'lobby', players: [] }),
      inviteLink: res.inviteUrl,
      settings: payload.settings,
      playerLimit: payload.settings.playerLimit,
    })),

  list: (_params: ListRoomsParams = {}) =>
    apiFetch<Array<{ pin: string; state: string; players: Array<{ playerId: string; name: string }> }>>(GAMES_BASE).then(
      (rooms): RoomsListResponseDto => ({ rooms: rooms.map(mapStateToRoomDetails) }),
    ),

  open: async (roomId: string) => {
    await apiFetch<void>(`${GAMES_BASE}/${encodeURIComponent(roomId)}/start`, {
      method: 'POST',
    })
    return roomsApi.details(roomId)
  },

  pause: async (roomId: string) => {
    await apiFetch<void>(`${GAMES_BASE}/${encodeURIComponent(roomId)}/pause`, {
      method: 'POST',
    })
    return roomsApi.details(roomId)
  },

  details: (roomId: string) =>
    apiFetch<{ pin: string; state: string; players: Array<{ playerId: string; name: string }> }>(
      `${GAMES_BASE}/${encodeURIComponent(roomId)}`,
    ).then(mapStateToRoomDetails),

  close: (roomId: string) =>
    apiFetch<void>(`${GAMES_BASE}/${encodeURIComponent(roomId)}/leave`, {
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

  getOpenRooms: () => apiFetch<GameDto[]>(GAMES_BASE),
  getRoomState: (roomId: string) => apiFetch<RoomStateDto>(`${GAMES_BASE}/${encodeURIComponent(roomId)}/state`),
}
