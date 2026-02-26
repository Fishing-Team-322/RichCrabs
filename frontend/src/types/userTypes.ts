export interface User {
  id: string
  name: string
  email: string
  gamesPlayed: number
  wins: number
  subscription?: 'basic' | 'premium'
}

export interface AuthResponse {
  token: string
  gameId: string
  user: User
}