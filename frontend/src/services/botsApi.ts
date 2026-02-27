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

const BOTS_BASE = '/api/v1/bots'
const TELEGRAM_CONNECT = '/api/v1/telegram/bots/connect'

const mapBot = (bot: { botId: string; name: string; status: string }): BotDto => ({
  id: bot.botId,
  name: bot.name,
  username: bot.name,
  enabled: bot.status !== 'disabled',
  createdAt: new Date(0).toISOString(),
})

export const botsApi = {
  list: () => apiFetch<{ bots: Array<{ botId: string; name: string; status: string }> }>(BOTS_BASE).then((res) => res.bots.map(mapBot)),
  create: (payload: CreateBotRequestDto) =>
    apiFetch<{ bot: { botId: string; name: string; status: string } }>(BOTS_BASE, {
      method: 'POST',
      body: JSON.stringify({ name: payload.name, version: '1.0.0', endpoint: payload.token }),
    }).then((res) => mapBot(res.bot)),
  remove: (botId: string) =>
    apiFetch<void>(`${BOTS_BASE}/${encodeURIComponent(botId)}`, {
      method: 'DELETE',
    }),
  validate: (payload: ValidateTelegramBotRequestDto) =>
    apiFetch<{ botId: string; status: string }>(TELEGRAM_CONNECT, {
      method: 'POST',
      body: JSON.stringify(payload),
    }).then((res): ValidateTelegramBotResponseDto => ({ ok: res.status === 'connected', botId: res.botId })),
  bind: (payload: BindTelegramBotRequestDto) =>
    apiFetch<{ botId: string; status: string }>(TELEGRAM_CONNECT, {
      method: 'POST',
      body: JSON.stringify(payload),
    }).then((res): BindTelegramBotResponseDto => ({ bindingId: res.botId, botId: res.botId })),
  status: () =>
    apiFetch<{ bots: Array<{ botId: string; name: string; status: string }> }>(BOTS_BASE).then((res): TelegramBotRuntimeStatusDto => {
      const bot = res.bots[0]
      return {
        bindingId: bot?.botId || 'none',
        botId: bot?.botId,
        username: bot?.name,
        name: bot?.name,
        active: Boolean(bot),
        operations: [],
      }
    }),
  unbind: async () => {
    const status = await botsApi.status()
    if (!status.botId) return
    await botsApi.remove(status.botId)
  },
}
