import { beforeEach, describe, expect, it, vi } from 'vitest'
import { roomsApi } from '../roomsApi'

const jsonResponse = (body: unknown, status = 200) =>
  new Response(status === 204 ? null : JSON.stringify(body), { status })

describe('roomsApi contract', () => {
  beforeEach(() => {
    document.cookie = 'XSRF-TOKEN=test'
    vi.restoreAllMocks()
  })

  it('uses /api/v1/games for create/list/getOpenRooms', async () => {
    const fetchMock = vi
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ pin: 'ABC123', inviteUrl: '/invite/t' }))
      .mockResolvedValueOnce(jsonResponse([{ pin: 'ABC123', state: 'lobby', players: [] }]))
      .mockResolvedValueOnce(jsonResponse([{ id: '1', pin: 'ABC123', players: [], status: 'waiting' }]))
    await roomsApi.create({ quizId: 'q1', settings: { playerLimit: 10, privacy: 'private', timers: { lobbyTimerSec: 1, questionTimerSec: 1, answerRevealSec: 1 } } })
    await roomsApi.list()
    await roomsApi.getOpenRooms()
    expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/v1/games', expect.objectContaining({ method: 'POST' }))
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/v1/games', expect.objectContaining({ method: 'GET' }))
    expect(fetchMock).toHaveBeenNthCalledWith(3, '/api/v1/games', expect.objectContaining({ method: 'GET' }))
  })

  it('uses /api/v1/games/{pin} endpoints', async () => {
    const fetchMock = vi
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ pin: 'ABC123', state: 'lobby', players: [] }))
      .mockResolvedValueOnce(jsonResponse(null, 204))
      .mockResolvedValueOnce(jsonResponse({ pin: 'ABC123', state: 'playing', players: [] }))
      .mockResolvedValueOnce(jsonResponse(null, 204))
      .mockResolvedValueOnce(jsonResponse({ pin: 'ABC123', state: 'paused', players: [] }))
      .mockResolvedValueOnce(jsonResponse(null, 204))
      .mockResolvedValueOnce(jsonResponse({ id: 'state' }))
    await roomsApi.details('ABC123')
    await roomsApi.open('ABC123')
    await roomsApi.pause('ABC123')
    await roomsApi.close('ABC123')
    await roomsApi.getRoomState('ABC123')
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/games/ABC123', expect.objectContaining({ method: 'GET' }))
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/games/ABC123/start', expect.objectContaining({ method: 'POST' }))
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/games/ABC123/pause', expect.objectContaining({ method: 'POST' }))
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/games/ABC123/leave', expect.objectContaining({ method: 'POST' }))
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/games/ABC123/state', expect.objectContaining({ method: 'GET' }))
  })
})
