import { apiFetch } from './api'
import type {
  CreateRoomRequestDto,
  ListRoomsParams,
  RoomDetailsDto,
  RoomInviteDto,
  RoomsListResponseDto,
} from '../types/room.types'

const GAMES_BASE = '/api/v1/games'

type BackendRoomDto = {
  roomId: string
  pin: string
  quizId: string
  title: string
  state: string
  players: Array<{ playerId: string; name: string; score: number; teamId?: string | null }>
  playersCount: number
  hostUserId: string
  updatedAt: string
  invitePath: string
}

const toRoomStatus = (state: string): RoomDetailsDto['status'] => {
  if (state === 'playing') return 'active'
  if (state === 'paused') return 'paused'
  if (state === 'finished' || state === 'closed') return 'finished'
  return 'waiting'
}

const mapBackendRoom = (payload: BackendRoomDto): RoomDetailsDto => ({
  id: payload.pin,
  quizId: payload.quizId,
  quizTitle: payload.title,
  pin: payload.pin,
  inviteLink: payload.invitePath,
  status: toRoomStatus(payload.state),
  playersCount: payload.playersCount,
  playerLimit: payload.playersCount,
  hostId: payload.hostUserId,
  updatedAt: payload.updatedAt,
  isHost: true,
  settings: {
    playerLimit: payload.playersCount,
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
    team: (player.teamId as 'A' | 'B' | undefined) ?? (index % 2 === 0 ? 'A' : 'B'),
  })),
})

export const roomsApi = {
  create: (payload: CreateRoomRequestDto) =>
    apiFetch<{ pin: string; invitePath: string; wsUrl?: string }>(GAMES_BASE, {
      method: 'POST',
      body: JSON.stringify({ ownerUserId: payload.ownerUserId, quizId: payload.quizId, title: `Quiz ${payload.quizId}` }),
    }).then((res): RoomDetailsDto => ({
      ...mapBackendRoom({
        roomId: res.pin,
        pin: res.pin,
        quizId: payload.quizId,
        title: `Quiz ${payload.quizId}`,
        state: 'lobby',
        players: [],
        playersCount: 0,
        hostUserId: payload.ownerUserId,
        updatedAt: new Date().toISOString(),
        invitePath: res.invitePath,
      }),
      wsUrl: res.wsUrl,
      settings: payload.settings,
      playerLimit: payload.settings.playerLimit,
    })),

  list: (_params: ListRoomsParams = {}) =>
    apiFetch<BackendRoomDto[]>(GAMES_BASE).then((rooms): RoomsListResponseDto => ({ rooms: rooms.map(mapBackendRoom) })),

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

  details: (roomId: string) => apiFetch<BackendRoomDto>(`${GAMES_BASE}/${encodeURIComponent(roomId)}`).then(mapBackendRoom),

  close: (roomId: string) =>
    apiFetch<void>(`${GAMES_BASE}/${encodeURIComponent(roomId)}/leave`, {
      method: 'POST',
    }),

  regenerateInvite: (roomId: string) =>
    apiFetch<RoomInviteDto>(`${GAMES_BASE}/${encodeURIComponent(roomId)}/invite/regenerate`, {
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

  getOpenRooms: () => apiFetch<BackendRoomDto[]>(GAMES_BASE),
  getRoomState: (roomId: string) => apiFetch<BackendRoomDto>(`${GAMES_BASE}/${encodeURIComponent(roomId)}/state`),
}
