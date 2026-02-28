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
const TELEGRAM_STATUS = '/api/v1/telegram/bots/status'
const TELEGRAM_UNBIND = '/api/v1/telegram/bots'

type TelegramConnectResponse = {
  bindingId?: string
  botId?: string
  active?: boolean
  status?: string
  lastSeenAt?: string
  operations?: TelegramBotRuntimeStatusDto['operations']
  name?: string
  username?: string
}

const mapBot = (bot: { botId: string; name: string; status: string }): BotDto => ({
  id: bot.botId,
  name: bot.name,
  username: bot.name,
  enabled: bot.status !== 'disabled',
  createdAt: new Date(0).toISOString(),
})

const mapConnectToBinding = (res: TelegramConnectResponse): BindTelegramBotResponseDto => ({
  bindingId: res.bindingId ?? res.botId ?? '',
  botId: res.botId,
  username: res.username,
  name: res.name,
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
  validate: async (payload: ValidateTelegramBotRequestDto) => {
    const res = await apiFetch<TelegramConnectResponse>(TELEGRAM_CONNECT, {
      method: 'POST',
      body: JSON.stringify({ token: payload.token }),
    })
    return { ok: Boolean((res.bindingId ?? res.botId) && (res.active ?? res.status === 'connected')), botId: res.botId, username: res.username, name: res.name } as ValidateTelegramBotResponseDto
  },
  bind: (payload: BindTelegramBotRequestDto) =>
    apiFetch<TelegramConnectResponse>(TELEGRAM_CONNECT, {
      method: 'POST',
      body: JSON.stringify({ token: payload.token }),
    }).then(mapConnectToBinding),
  status: () =>
    apiFetch<TelegramBotRuntimeStatusDto>(TELEGRAM_STATUS).then((status) => ({
      ...status,
      operations: Array.isArray(status.operations) ? status.operations : [],
    })),
  unbind: async () => {
    const status = await botsApi.status()
    if (!status.botId) return
    await apiFetch<void>(`${TELEGRAM_UNBIND}/${encodeURIComponent(status.botId)}`, {
      method: 'DELETE',
    })
  },
}
