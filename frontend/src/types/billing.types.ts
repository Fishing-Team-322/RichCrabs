export interface BillingPlanLimitDto {
  key: string
  title: string
  value: number | string | null
  unit?: string
}

export interface BillingPlanDto {
  id: string
  code: string
  title: string
  description?: string
  price: number
  currency: string
  interval: 'month' | 'year'
  limits?: BillingPlanLimitDto[]
  recommended?: boolean
}

export interface SubscriptionDto {
  id: string
  planCode: string
  status: 'active' | 'trialing' | 'past_due' | 'canceled' | 'incomplete' | string
  currentPeriodEnd: string
  currentPeriodStart?: string
  cancelAtPeriodEnd?: boolean
  renewedAt?: string
}

export interface CheckoutPayload {
  planCode: string
  promoCode?: string
}

export interface CheckoutSessionDto {
  checkoutUrl: string
  sessionId?: string
  status?: string
}

export interface PromoCodeDto {
  code: string
}

export interface BillingPaymentStatusDto {
  id: string
  status: 'paid' | 'pending' | 'failed' | 'refunded' | string
  amount: number
  currency: string
  occurredAt: string
  description?: string
}

export interface BillingHistoryDto {
  transactions: BillingPaymentStatusDto[]
}

export interface PaymentCallbackDto {
  sessionId?: string
  paymentStatus?: string
}
