import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { billingApi } from '../../services/billingApi'
import type { BillingPaymentStatusDto, BillingPlanDto, SubscriptionDto } from '../../types/billing.types'
import './subscriptions.css'

const money = (amount: number, currency: string) =>
  new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency: currency || 'RUB',
    maximumFractionDigits: 0,
  }).format(amount)

const dateTime = (value?: string) => {
  if (!value) return '—'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return parsed.toLocaleString('ru-RU')
}

const statusLabel = (status: string) => {
  if (status === 'paid' || status === 'active') return 'Оплачено'
  if (status === 'pending' || status === 'trialing') return 'В обработке'
  if (status === 'failed' || status === 'past_due') return 'Ошибка оплаты'
  if (status === 'canceled') return 'Отменено'
  if (status === 'refunded') return 'Возврат'
  return status
}

const statusClass = (status: string) => {
  if (status === 'paid' || status === 'active') return 'ok'
  if (status === 'pending' || status === 'trialing' || status === 'incomplete') return 'pending'
  if (status === 'failed' || status === 'past_due') return 'error'
  return 'neutral'
}

const renderLimitValue = (plan: BillingPlanDto, key: string) => {
  const limit = plan.limits?.find((entry) => entry.key === key)
  if (!limit) return '—'
  if (typeof limit.value === 'number') {
    const value = Number.isFinite(limit.value) ? limit.value.toLocaleString('ru-RU') : '∞'
    return `${value}${limit.unit ? ` ${limit.unit}` : ''}`
  }
  return limit.value || '—'
}

const Subscriptions = () => {
  const { t } = useTranslation()
  const [searchParams, setSearchParams] = useSearchParams()

  const [plans, setPlans] = useState<BillingPlanDto[]>([])
  const [current, setCurrent] = useState<SubscriptionDto | null>(null)
  const [transactions, setTransactions] = useState<BillingPaymentStatusDto[]>([])

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [historyUnsupported, setHistoryUnsupported] = useState(false)

  const [checkoutPending, setCheckoutPending] = useState<string | null>(null)
  const [cancelPending, setCancelPending] = useState(false)
  const [promoCode, setPromoCode] = useState('')
  const [promoPending, setPromoPending] = useState(false)
  const [promoMessage, setPromoMessage] = useState<string | null>(null)

  const [callbackMessage, setCallbackMessage] = useState<string | null>(null)

  const loadData = async () => {
    setLoading(true)
    setError(null)

    const [plansResult, currentResult, historyResult] = await Promise.allSettled([
      billingApi.plans(),
      billingApi.current(),
      billingApi.history(),
    ])

    if (plansResult.status === 'fulfilled') {
      setPlans(plansResult.value)
    } else {
      setError(plansResult.reason instanceof Error ? plansResult.reason.message : 'Не удалось загрузить тарифы')
    }

    if (currentResult.status === 'fulfilled') {
      setCurrent(currentResult.value)
    } else {
      setError((prev) => prev || (currentResult.reason instanceof Error ? currentResult.reason.message : 'Не удалось загрузить текущую подписку'))
    }

    if (historyResult.status === 'fulfilled') {
      setTransactions(historyResult.value.transactions || [])
      setHistoryUnsupported(false)
    } else {
      const message = historyResult.reason instanceof Error ? historyResult.reason.message : ''
      if (message.includes('404')) {
        setHistoryUnsupported(true)
      } else {
        setError((prev) => prev || message || 'Не удалось загрузить историю платежей')
      }
    }

    setLoading(false)
  }

  useEffect(() => {
    void loadData()
  }, [])

  useEffect(() => {
    const paymentStatus = searchParams.get('paymentStatus') || searchParams.get('status')
    const sessionId = searchParams.get('sessionId') || searchParams.get('session_id')

    if (!paymentStatus && !sessionId) return

    const sendCallback = async () => {
      try {
        await billingApi.paymentCallbackStatus({ paymentStatus: paymentStatus || undefined, sessionId: sessionId || undefined })
        setCallbackMessage(`Платежный callback принят. Статус: ${paymentStatus || 'unknown'}`)
      } catch {
        setCallbackMessage(`Не удалось сохранить callback-статус: ${paymentStatus || 'unknown'}`)
      } finally {
        const nextParams = new URLSearchParams(searchParams)
        nextParams.delete('paymentStatus')
        nextParams.delete('status')
        nextParams.delete('sessionId')
        nextParams.delete('session_id')
        setSearchParams(nextParams, { replace: true })
      }
    }

    void sendCallback()
  }, [searchParams, setSearchParams])

  const limitRows = useMemo(() => {
    const keys = new Map<string, string>()
    plans.forEach((plan) =>
      plan.limits?.forEach((limit) => {
        keys.set(limit.key, limit.title)
      })
    )
    return [...keys.entries()].map(([key, title]) => ({ key, title }))
  }, [plans])

  const onCheckout = async (planCode: string) => {
    setCheckoutPending(planCode)
    setError(null)
    try {
      const result = await billingApi.checkout({ planCode, promoCode: promoCode.trim() || undefined })
      if (result.checkoutUrl) {
        window.location.href = result.checkoutUrl
        return
      }
      await loadData()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Не удалось оформить подписку'
      setError(message)
    } finally {
      setCheckoutPending(null)
    }
  }

  const onCancel = async () => {
    setCancelPending(true)
    setError(null)
    try {
      await billingApi.cancel()
      await loadData()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Не удалось отменить подписку'
      setError(message)
    } finally {
      setCancelPending(false)
    }
  }

  const onApplyPromo = async (event: FormEvent) => {
    event.preventDefault()
    setPromoPending(true)
    setPromoMessage(null)
    try {
      await billingApi.applyPromo({ code: promoCode.trim() })
      setPromoMessage('Промокод применен. Скидка учтется при следующей оплате.')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Не удалось применить промокод'
      setPromoMessage(message)
    } finally {
      setPromoPending(false)
    }
  }

  if (loading) {
    return <section className="pageCard">{t('subscriptions.loading')}</section>
  }

  return (
    <section className="subscriptionsPage">
      <article className="pageCard">
        <h1>{t('subscriptions.title')}</h1>
        {callbackMessage && <div className="subsNotice">{callbackMessage}</div>}
        {error && <div className="subsError">{error}</div>}

        <div className="currentPlanCard">
          <h2>Текущий план</h2>
          {current ? (
            <>
              <div className="subsPills">
                <span className="subsBadge">{current.planCode}</span>
                <span className={`subsBadge status-${statusClass(current.status)}`}>{statusLabel(current.status)}</span>
              </div>
              <p>Дата продления: {dateTime(current.currentPeriodEnd)}</p>
              <div className="subsActions">
                <button onClick={onCancel} disabled={cancelPending || current.status === 'canceled'}>
                  {cancelPending ? 'Отменяем...' : 'Отменить подписку'}
                </button>
              </div>
            </>
          ) : (
            <p>Подписка пока не активна.</p>
          )}
        </div>
      </article>

      <article className="pageCard">
        <h2>Доступные планы</h2>
        <div className="plansGrid">
          {plans.map((plan) => {
            const isCurrent = current?.planCode === plan.code
            return (
              <div key={plan.id} className={`planCard ${isCurrent ? 'current' : ''}`}>
                <div className="planHeader">
                  <h3>{plan.title}</h3>
                  {isCurrent && <span className="subsBadge">Текущий</span>}
                </div>
                <div className="planPrice">
                  {money(plan.price, plan.currency)} / {plan.interval === 'month' ? 'месяц' : 'год'}
                </div>
                {plan.description && <p>{plan.description}</p>}
                <button onClick={() => void onCheckout(plan.code)} disabled={checkoutPending !== null}>
                  {checkoutPending === plan.code
                    ? 'Переходим к оплате...'
                    : isCurrent
                      ? 'Продлить'
                      : current
                        ? 'Сменить план'
                        : 'Оформить'}
                </button>
              </div>
            )
          })}
        </div>
      </article>

      {limitRows.length > 0 && (
        <article className="pageCard">
          <h2>Сравнение лимитов</h2>
          <div className="limitsTableWrap">
            <table className="limitsTable">
              <thead>
                <tr>
                  <th>Лимит</th>
                  {plans.map((plan) => (
                    <th key={plan.id}>{plan.title}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {limitRows.map((row) => (
                  <tr key={row.key}>
                    <td>{row.title}</td>
                    {plans.map((plan) => (
                      <td key={`${plan.id}-${row.key}`}>{renderLimitValue(plan, row.key)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>
      )}

      <article className="pageCard">
        <h2>Промокод</h2>
        <form className="promoForm" onSubmit={onApplyPromo}>
          <input
            value={promoCode}
            onChange={(event) => setPromoCode(event.target.value)}
            placeholder="Введите промокод"
            minLength={3}
          />
          <button type="submit" disabled={promoPending || promoCode.trim().length < 3}>
            {promoPending ? 'Применяем...' : 'Применить'}
          </button>
        </form>
        {promoMessage && <div className="subsNotice">{promoMessage}</div>}
      </article>

      <article className="pageCard">
        <h2>Статусы платежей и история транзакций</h2>
        {historyUnsupported && <p>История транзакций пока недоступна через API.</p>}
        {!historyUnsupported && transactions.length === 0 && <p>Транзакций пока нет.</p>}
        {!historyUnsupported && transactions.length > 0 && (
          <div className="historyList">
            {transactions.map((tx) => (
              <div className="historyItem" key={tx.id}>
                <div>
                  <strong>{money(tx.amount, tx.currency)}</strong>
                  <div>{tx.description || 'Оплата подписки'}</div>
                </div>
                <div className={`subsBadge status-${statusClass(tx.status)}`}>{statusLabel(tx.status)}</div>
                <div>{dateTime(tx.occurredAt)}</div>
              </div>
            ))}
          </div>
        )}
      </article>
    </section>
  )
}

export default Subscriptions
