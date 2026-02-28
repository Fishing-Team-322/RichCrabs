import { beforeEach, describe, expect, it, vi } from 'vitest'
import { serviceApi } from '../serviceApi'

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

describe('serviceApi contract', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('loads health and session endpoints used by homepage bootstrap', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ status: 'ok', gateway: 'ok' }))
      .mockResolvedValueOnce(jsonResponse({ authenticated: false, role: 'guest' }))

    await serviceApi.health()
    await serviceApi.session()

    expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/v1/healthz', expect.objectContaining({ method: 'GET' }))
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/v1/session', expect.objectContaining({ method: 'GET' }))
  })
})

