import { beforeEach, describe, expect, it, vi } from 'vitest'
import { botsApi } from '../botsApi'

const jsonResponse = (body: unknown, status = 200) =>
  new Response(status === 204 ? null : JSON.stringify(body), { status })

describe('botsApi contract', () => {
  beforeEach(() => {
    document.cookie = 'XSRF-TOKEN=test'
    vi.restoreAllMocks()
  })

  it('uses /api/v1/bots CRUD', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ bots: [{ botId: 'b1', name: 'Bot', status: 'enabled' }] }))
      .mockResolvedValueOnce(jsonResponse({ bot: { botId: 'b2', name: 'Bot2', status: 'enabled' } }))
      .mockResolvedValueOnce(jsonResponse(null, 204))
    await botsApi.list()
    await botsApi.create({ name: 'Bot', token: 't' })
    await botsApi.remove('b2')
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/bots', expect.objectContaining({ method: 'GET' }))
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/bots', expect.objectContaining({ method: 'POST' }))
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/bots/b2', expect.objectContaining({ method: 'DELETE' }))
  })

  it('uses telegram backend contract for validate/bind/status/unbind', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ botId: 'b1', status: 'connected', metadata: { name: 'Bot' } }))
      .mockResolvedValueOnce(jsonResponse({ botId: 'b1', status: 'connected', metadata: { name: 'Bot' } }))
      .mockResolvedValueOnce(jsonResponse({ bindingId: 'b1', botId: 'b1', active: true, operations: [] }))
      .mockResolvedValueOnce(jsonResponse({ bindingId: 'b1', botId: 'b1', active: true, operations: [] }))
      .mockResolvedValueOnce(jsonResponse(null, 204))
    await botsApi.validate({ token: 't' })
    await botsApi.bind({ token: 't' })
    await botsApi.status()
    await botsApi.unbind()
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/telegram/bots/connect', expect.objectContaining({ method: 'POST' }))
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/telegram/bots/status', expect.objectContaining({ method: 'GET' }))
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/telegram/bots/b1', expect.objectContaining({ method: 'DELETE' }))
  })
})
