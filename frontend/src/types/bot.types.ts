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
