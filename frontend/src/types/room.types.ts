export type Team = 'A' | 'B'

export interface PlayerDto {
  id: string
  name: string
  team: Team
}

export interface JoinRoomRequestDto {
  pin: string
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
  phase: 'lobby' | 'playing' | 'finished'
  players: PlayerDto[]
  scores: { A: number; B: number }
  turn: Team | null
  currentQuestion: import('./quiz.types').QuizQuestionDto | null
  timeLeft: number
  canAnswer: boolean
  isCreator: boolean
}

export interface GameDto {
  id: string
  pin: string
  players: PlayerDto[]
  status: 'waiting' | 'playing' | 'finished'
}
