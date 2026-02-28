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

export const billingApi = {
  plans: () =>
    apiFetch<{ plans: BillingPlanDto[] }>('/api/v1/billing/plans').then((res): BillingPlanDto[] => res.plans || []),
  current: () =>
    apiFetch<{ subscription: SubscriptionDto }>('/api/v1/billing/current').then(
      (res): SubscriptionDto =>
        res.subscription || {
          id: 'free',
          planCode: 'free',
          status: 'active',
          currentPeriodEnd: new Date(0).toISOString(),
        },
    ),
  checkout: (payload: CheckoutPayload) =>
    apiFetch<CheckoutSessionDto>('/api/v1/billing/checkout', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  cancel: () =>
    apiFetch<void>('/api/v1/billing/cancel', {
      method: 'POST',
    }),
  history: () =>
    apiFetch<BillingHistoryDto>('/api/v1/billing/history').then(
      (res): BillingHistoryDto => ({ transactions: res.transactions || [] }),
    ),
  applyPromo: (payload: PromoCodeDto) =>
    apiFetch<void>('/api/v1/billing/promo', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  paymentCallbackStatus: (payload: PaymentCallbackDto) =>
    apiFetch<void>('/api/v1/billing/callback-status', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
}
