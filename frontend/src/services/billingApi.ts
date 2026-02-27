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
  plans: () => apiFetch<BillingPlanDto[]>('/api/billing/plans'),
  current: () => apiFetch<SubscriptionDto>('/api/billing/current'),
  checkout: (payload: CheckoutPayload) =>
    apiFetch<CheckoutSessionDto>('/api/billing/checkout', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  cancel: () =>
    apiFetch<void>('/api/billing/cancel', {
      method: 'POST',
    }),
  history: () => apiFetch<BillingHistoryDto>('/api/billing/history'),
  applyPromo: (payload: PromoCodeDto) =>
    apiFetch<void>('/api/billing/promo', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  paymentCallbackStatus: (payload: PaymentCallbackDto) =>
    apiFetch<void>('/api/billing/callback-status', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
}
