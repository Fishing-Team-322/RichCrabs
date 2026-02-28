import { useEffect, useMemo, useState } from 'react'
import { IconAlert, IconChevron, IconRefresh } from '../../components/Icons'
import { MetricCard } from '../../components/MetricCard'
import { SecurityEventsTable } from '../../components/SecurityEventsTable'
import { useInterval } from '../../hooks/useInterval'
import { monitoringApi } from '../../features/monitoring/api/monitoringApi'
import { mockSecurityEvents, mockSecurityOverview } from '../../features/monitoring/mockSecurity'
import type { SecurityEventsResponse, SecurityOverview } from '../../features/monitoring/types'

type SecurityProps = {
  onStatus?: (ok: boolean, text: string, updatedAt: number | null) => void
}

const Security = ({ onStatus }: SecurityProps) => {
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [pollMs, setPollMs] = useState(2000)
  const [demoMode, setDemoMode] = useState(true)

  const [loading, setLoading] = useState(false)
  const [overview, setOverview] = useState<SecurityOverview>(() => mockSecurityOverview())
  const [events, setEvents] = useState<SecurityEventsResponse>(() => mockSecurityEvents(40))
  const [error, setError] = useState<string | null>(null)

  const refresh = async () => {
    try {
      setLoading(true)
      setError(null)

      if (demoMode) {
        setOverview(mockSecurityOverview())
        setEvents(mockSecurityEvents(40))
        return
      }

      const [nextOverview, nextEvents] = await Promise.all([monitoringApi.securityOverview(), monitoringApi.securityEvents(40)])
      setOverview(nextOverview)
      setEvents(nextEvents)
    } catch (apiError) {
      setError(apiError instanceof Error ? apiError.message : 'Не удалось загрузить события безопасности')
    } finally {
      setLoading(false)
    }
  }

  useInterval(() => {
    if (!autoRefresh) return
    void refresh()
  }, autoRefresh ? pollMs : null)

  useEffect(() => {
    void refresh()
  }, [demoMode])

  useEffect(() => {
    if (!onStatus) return
    const ok = !error
    onStatus(ok, ok ? 'Monitoring' : 'Error', Date.now())
  }, [error, onStatus])

  const windowLabel = useMemo(() => {
    const minutes = Math.round((overview.windowSec ?? 300) / 60)
    return `${minutes}m window`
  }, [overview.windowSec])

  return (
    <>
      <header className="topbar">
        <div className="topbarLeft"><div className="pageTitle"><div className="h1">Admin Security</div><div className="h2">Abuse monitor & security events</div></div></div>

        <div className="topbarRight">
          <div className="toggle"><input id="demoMode" type="checkbox" checked={demoMode} onChange={(event) => setDemoMode(event.target.checked)} /><label htmlFor="demoMode">Enable</label></div>
          <div className="toggle"><input id="autoRefreshSec" type="checkbox" checked={autoRefresh} onChange={(event) => setAutoRefresh(event.target.checked)} /><label htmlFor="autoRefreshSec">Auto</label></div>
          <div className="select compact"><select value={pollMs} onChange={(event) => setPollMs(parseInt(event.target.value, 10))}><option value={1000}>1s</option><option value={2000}>2s</option><option value={5000}>5s</option></select><IconChevron /></div>
          <button className="btn" onClick={() => void refresh()}><IconRefresh /> Refresh</button>
        </div>
      </header>

      {error ? <div className="routeState">{error}</div> : null}

      <section className="cards">
        <MetricCard title="Rate-limit hits" value={String(overview.rateLimitHits)} sub={windowLabel} tone="gray" icon={<IconAlert />} />
        <MetricCard title="Invalid join tickets" value={String(overview.invalidJoinTickets)} sub="expired / malformed" tone="orange" icon={<IconAlert />} />
        <MetricCard title="Replay detected" value={String(overview.replayDetected)} sub="one-time ticket reuse" tone="red" icon={<IconAlert />} />
        <MetricCard title="Suspicious bursts" value={String(overview.suspiciousBursts)} sub="join spike heuristic" tone="violet" icon={<IconAlert />} />
      </section>

      <section className="panel">
        <div className="panelHead">
          <div><div className="panelTitle">Recent security events</div><div className="panelSub">{loading ? 'loading…' : `events: ${events.events.length}`}</div></div>
          <div className="panelRight"><div className="panelKpi"><span className="k">WS drops</span><span className="v">{overview.wsQueueDrops}</span></div></div>
        </div>
        <SecurityEventsTable events={events.events} loading={loading} />
      </section>
    </>
  )
}

export default Security
