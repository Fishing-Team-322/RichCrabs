export interface ApiError {
  message: string
  status: number
}

export interface JoinGameRequest {
  pin: string
  playerName: string
}

export interface JoinGameResponse {
  token: string
  gameId: string
  playerId: string
}

export interface CreateGameRequest {
  topic: string
  questionCount: number
}

export interface CreateGameResponse {
  creatorToken: string
  gameId: string
  pin: string
}