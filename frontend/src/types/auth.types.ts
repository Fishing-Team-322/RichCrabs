export interface UserDto {
  id: string
  displayName: string
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
  displayName?: string
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

export interface AuthResponseDto {
  csrfToken?: string
  gameId?: string
  user: UserDto
}

export interface LoginRequestDto {
  email: string
  password: string
}

export interface RegisterRequestDto extends LoginRequestDto {
  displayName: string
}
