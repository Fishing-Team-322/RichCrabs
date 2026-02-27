import { apiFetch } from './api'
import type {
  BillingHistoryDto,
  BillingPlanDto,
  CheckoutPayload,
  CheckoutSessionDto,
  PaymentCallbackDto,
  PromoCodeDto,
  SubscriptionDto,
} from '../types/billing.types'

const notImplemented = (operation: string): Promise<never> =>
  Promise.reject(new Error(`Billing endpoint ${operation} is not implemented in Python gateway yet.`))

export const billingApi = {
  plans: () =>
    apiFetch<{
      limits: Array<{ limit: string; max: number | null }>
    }>('/api/v1/entitlements').then((res): BillingPlanDto[] => [{
      id: 'free',
      code: 'free',
      title: 'Free',
      price: 0,
      currency: 'USD',
      interval: 'month',
      limits: res.limits.map((entry) => ({ key: entry.limit, title: entry.limit, value: entry.max })),
    }]),
  current: () =>
    apiFetch<{ usage: Record<string, number> }>('/api/v1/usage').then(
      (): SubscriptionDto => ({ id: 'free', planCode: 'free', status: 'active', currentPeriodEnd: new Date(0).toISOString() }),
    ),
  checkout: (_payload: CheckoutPayload) => notImplemented('checkout') as Promise<CheckoutSessionDto>,
  cancel: () => notImplemented('cancel') as Promise<void>,
  history: () => Promise.resolve({ transactions: [] } as BillingHistoryDto),
  applyPromo: (_payload: PromoCodeDto) => notImplemented('promo') as Promise<void>,
  paymentCallbackStatus: (_payload: PaymentCallbackDto) => notImplemented('callback-status') as Promise<void>,
}
