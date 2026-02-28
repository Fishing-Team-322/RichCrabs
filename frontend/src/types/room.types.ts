export type Team = 'A' | 'B'

export type RoomPhase = 'lobby' | 'playing' | 'finished'
export type RoomVisibility = 'public' | 'private'
export type RoomStatus = 'waiting' | 'active' | 'paused' | 'finished'

export interface PlayerDto {
  id: string
  name: string
  team: Team
}

export interface JoinRoomRequestDto {
  pin?: string
  inviteToken?: string
  playerName: string
}

export interface JoinRoomResponseDto {
  token: string
  gameId: string
  playerId: string
}

export interface RoomStateDto {
  id: string
  pin: string
  phase: RoomPhase
  players: PlayerDto[]
  scores: { A: number; B: number }
  turn: Team | null
  currentQuestion: import('./quiz.types').QuizQuestionDto | null
  timeLeft: number
  canAnswer: boolean
  isCreator: boolean
}

export interface RoomTimersDto {
  lobbyTimerSec: number
  questionTimerSec: number
  answerRevealSec: number
}

export interface RoomSettingsDto {
  playerLimit: number
  privacy: RoomVisibility
  timers: RoomTimersDto
}

export interface CreateRoomRequestDto {
  ownerUserId: string
  quizId: string
  settings: RoomSettingsDto
}

export interface RoomInviteDto {
  inviteToken: string
  invitePath: string
  inviteQrSvg: string
}

export interface RoomSummaryDto {
  id: string
  quizId: string
  quizTitle: string
  pin: string
  inviteLink: string
  status: RoomStatus
  playersCount: number
  playerLimit: number
  hostId: string
  updatedAt: string
  isHost: boolean
}

export interface RoomDetailsDto extends RoomSummaryDto {
  settings: RoomSettingsDto
  players: PlayerDto[]
}

export interface RoomsListResponseDto {
  rooms: RoomSummaryDto[]
}

export interface ListRoomsParams {
  status?: RoomStatus | 'all'
}

export interface GameDto {
  id: string
  pin: string
  players: PlayerDto[]
  status: 'waiting' | 'playing' | 'finished'
}
