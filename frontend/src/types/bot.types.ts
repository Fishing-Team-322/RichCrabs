export interface BotDto {
  id: string
  name: string
  username: string
  enabled: boolean
  createdAt: string
}

export interface CreateBotRequestDto {
  name: string
  token: string
}

export interface ValidateTelegramBotRequestDto {
  token: string
}

export interface ValidateTelegramBotResponseDto {
  ok: boolean
  botId?: string
  username?: string
  name?: string
  message?: string
}

export interface BindTelegramBotRequestDto {
  token: string
}

export interface BindTelegramBotResponseDto {
  bindingId: string
  botId?: string
  username?: string
  name?: string
  boundAt?: string
}

export interface BotRuntimeOperationDto {
  id: string
  type: 'room_created' | 'pin_issued' | 'invite_issued' | string
  roomId?: string
  roomTitle?: string
  value?: string
  createdAt: string
}

export interface TelegramBotRuntimeStatusDto {
  bindingId: string
  botId?: string
  username?: string
  name?: string
  active: boolean
  lastSeenAt?: string
  operations: BotRuntimeOperationDto[]
}
