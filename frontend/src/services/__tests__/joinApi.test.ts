import { beforeEach, describe, expect, it, vi } from 'vitest'
import { joinApi } from '../joinApi'

const jsonResponse = (body: unknown) => new Response(JSON.stringify(body), { status: 200 })

describe('joinApi contract', () => {
  beforeEach(() => {
    document.cookie = 'XSRF-TOKEN=test'
    vi.restoreAllMocks()
  })

  it('joins by pin via /api/v1/games/{pin}/join', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ joinTicket: 't', roomPin: 'ABC123', playerId: 'p1', wsUrl: 'ws://localhost:8080/ws' }))
    const joined = await joinApi.joinByPin('ABC123', 'Alice')
    expect(joined.gameId).toBe('ABC123')
    expect(joined.wsUrl).toBe('ws://localhost:8080/ws')
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/games/ABC123/join', expect.objectContaining({ method: 'POST' }))
  })

  it('joins by invite via /api/v1/invites/{token}/join', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ joinTicket: 't', playerId: 'p1', wsUrl: 'ws://localhost:8080/ws' }))
    const joined = await joinApi.joinByInviteToken('token', 'Alice')
    expect(joined.wsUrl).toBe('ws://localhost:8080/ws')
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/invites/token/join', expect.objectContaining({ method: 'POST' }))
  })
})
