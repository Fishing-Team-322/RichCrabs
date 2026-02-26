import { apiFetch } from './api'
import type { BotDto, CreateBotRequestDto } from '../types/bot.types'

export const botsApi = {
  list: () => apiFetch<BotDto[]>('/api/bots'),
  create: (payload: CreateBotRequestDto) =>
    apiFetch<BotDto>('/api/bots', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  remove: (botId: string) =>
    apiFetch<void>(`/api/bots/${encodeURIComponent(botId)}`, {
      method: 'DELETE',
    }),
}
