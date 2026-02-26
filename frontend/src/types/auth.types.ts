export interface UserDto {
  id: string
  name: string
  email: string
  gamesPlayed: number
  wins: number
  subscription?: 'basic' | 'premium'
}

export interface AuthTokensDto {
  accessToken: string
  refreshToken?: string
}

export interface AuthResponseDto {
  token?: string
  accessToken?: string
  refreshToken?: string
  gameId?: string
  user: UserDto
}

export interface LoginRequestDto {
  email: string
  password: string
}

export interface RegisterRequestDto extends LoginRequestDto {
  name: string
}

export interface RefreshResponseDto {
  token?: string
  accessToken?: string
  refreshToken?: string
}
