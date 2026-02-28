import { beforeEach, describe, expect, it, vi } from 'vitest'
import { billingApi } from '../billingApi'

const jsonResponse = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })

describe('billingApi contract', () => {
  beforeEach(() => {
    document.cookie = 'XSRF-TOKEN=test'
    vi.restoreAllMocks()
  })

  it('uses dedicated billing endpoints for plans/current/history', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ plans: [{ id: 'free', code: 'free', title: 'Free', price: 0, currency: 'USD', interval: 'month' }] }))
      .mockResolvedValueOnce(jsonResponse({ subscription: { id: 'sub1', planCode: 'free', status: 'active', currentPeriodEnd: '2026-03-01T00:00:00.000Z' } }))
      .mockResolvedValueOnce(jsonResponse({ transactions: [] }))

    const plans = await billingApi.plans()
    const current = await billingApi.current()
    const history = await billingApi.history()

    expect(plans[0].code).toBe('free')
    expect(current.planCode).toBe('free')
    expect(history.transactions).toEqual([])
    expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/v1/billing/plans', expect.objectContaining({ method: 'GET' }))
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/v1/billing/current', expect.objectContaining({ method: 'GET' }))
    expect(fetchMock).toHaveBeenNthCalledWith(3, '/api/v1/billing/history', expect.objectContaining({ method: 'GET' }))
  })

  it('calls mutable billing endpoints', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async () => jsonResponse({ ok: true }))

    await billingApi.checkout({ planCode: 'free' })
    await billingApi.cancel()
    await billingApi.applyPromo({ code: 'PROMO' })
    await billingApi.paymentCallbackStatus({ sessionId: 's' })

    expect(fetchMock).toHaveBeenCalledWith('/api/v1/billing/checkout', expect.objectContaining({ method: 'POST' }))
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/billing/cancel', expect.objectContaining({ method: 'POST' }))
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/billing/promo', expect.objectContaining({ method: 'POST' }))
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/billing/callback-status', expect.objectContaining({ method: 'POST' }))
  })
})
