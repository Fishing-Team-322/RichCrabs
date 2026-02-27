import { beforeEach, describe, expect, it, vi } from 'vitest'
import { billingApi } from '../billingApi'

const jsonResponse = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })

describe('billingApi contract', () => {
  beforeEach(() => {
    document.cookie = 'XSRF-TOKEN=test'
    vi.restoreAllMocks()
  })

  it('uses /api/v1/entitlements and /api/v1/usage for available billing data', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ limits: [{ limit: 'rooms', max: 10 }] }))
      .mockResolvedValueOnce(jsonResponse({ usage: { rooms: 1 } }))
    const plans = await billingApi.plans()
    const current = await billingApi.current()
    expect(plans[0].code).toBe('free')
    expect(current.planCode).toBe('free')
    expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/v1/entitlements', expect.objectContaining({ method: 'GET' }))
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/v1/usage', expect.objectContaining({ method: 'GET' }))
  })

  it('documents missing gateway endpoints for mutable billing operations', async () => {
    await expect(billingApi.checkout({ planCode: 'pro' })).rejects.toThrow('not implemented')
    await expect(billingApi.cancel()).rejects.toThrow('not implemented')
    await expect(billingApi.applyPromo({ code: 'PROMO' })).rejects.toThrow('not implemented')
    await expect(billingApi.paymentCallbackStatus({ sessionId: 's' })).rejects.toThrow('not implemented')
    expect(await billingApi.history()).toEqual({ transactions: [] })
  })
})
