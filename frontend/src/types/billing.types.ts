export interface BillingPlanDto {
  id: string
  code: string
  title: string
  price: number
  currency: string
  interval: 'month' | 'year'
}

export interface SubscriptionDto {
  id: string
  planCode: string
  status: 'active' | 'trialing' | 'past_due' | 'canceled'
  currentPeriodEnd: string
}
