export interface UserDto {
  id: string
  name: string
  email: string
  avatarUrl?: string
  timezone?: string
  locale?: string
  gamesPlayed: number
  quizzesPlayed?: number
  wins: number
  subscription?: 'basic' | 'premium' | 'pro' | string
  telegramBotConnected?: boolean
  telegramBotUsername?: string
}

export interface UpdateProfileDto {
  name?: string
  avatarUrl?: string
  timezone?: string
  locale?: string
}

export interface PasswordChangeDto {
  currentPassword: string
  newPassword: string
}

export interface SessionDto {
  id: string
  ip?: string
  userAgent?: string
  createdAt?: string
  lastSeenAt?: string
  current?: boolean
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
