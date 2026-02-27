import { apiFetch } from './api'
import type {
  BindTelegramBotRequestDto,
  BindTelegramBotResponseDto,
  BotDto,
  CreateBotRequestDto,
  TelegramBotRuntimeStatusDto,
  ValidateTelegramBotRequestDto,
  ValidateTelegramBotResponseDto,
} from '../types/bot.types'

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
  validate: (payload: ValidateTelegramBotRequestDto) =>
    apiFetch<ValidateTelegramBotResponseDto>('/api/bots/telegram/validate', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  bind: (payload: BindTelegramBotRequestDto) =>
    apiFetch<BindTelegramBotResponseDto>('/api/bots/telegram/bind', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  status: () => apiFetch<TelegramBotRuntimeStatusDto>('/api/bots/telegram/status'),
  unbind: () =>
    apiFetch<void>('/api/bots/telegram/unbind', {
      method: 'POST',
    }),
}
