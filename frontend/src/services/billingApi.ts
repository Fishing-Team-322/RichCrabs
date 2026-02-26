import { apiFetch } from './api'
import type { BillingPlanDto, SubscriptionDto } from '../types/billing.types'

export const billingApi = {
  getPlans: () => apiFetch<BillingPlanDto[]>('/api/billing/plans'),
  getSubscription: () => apiFetch<SubscriptionDto>('/api/billing/subscription'),
}
