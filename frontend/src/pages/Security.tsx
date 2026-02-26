import React, { useMemo, useState } from "react";
import { api } from "../api";
import type { SecurityEventsResponse, SecurityOverview } from "../types";
import { useInterval } from "../hooks/useInterval";
import { MetricCard } from "../components/MetricCard";
import { SecurityEventsTable } from "../components/SecurityEventsTable";
import { IconAlert, IconChevron, IconRefresh } from "../components/Icons";
import { mockSecurityEvents, mockSecurityOverview } from "../mocks/security";

export function SecurityPage(props: {
  onStatus: (ok: boolean, text: string, updatedAt: number | null) => void;
}) {
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [pollMs, setPollMs] = useState(2000);
  const [demoMode, setDemoMode] = useState(true); // чтобы красиво работало даже без бэка

  const [loading, setLoading] = useState(false);
  const [ov, setOv] = useState<SecurityOverview>(() => mockSecurityOverview());
  const [events, setEvents] = useState<SecurityEventsResponse>(() => mockSecurityEvents(40));

  async function refresh() {
    try {
      setLoading(true);

      if (demoMode) {
        setOv(mockSecurityOverview());
        setEvents(mockSecurityEvents(40));
        props.onStatus(true, "DEMO", Date.now());
        return;
      }

      const [o, e] = await Promise.all([api.securityOverview(), api.securityEvents(40)]);
      setOv(o);
      setEvents(e);
      props.onStatus(true, "OK", Date.now());
    } catch (err: any) {
      props.onStatus(false, err?.message ?? "error", null);
    } finally {
      setLoading(false);
    }
  }

  useInterval(() => {
    if (!autoRefresh) return;
    refresh();
  }, autoRefresh ? pollMs : null);

  React.useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const windowLabel = useMemo(() => {
    const m = Math.round((ov.windowSec ?? 300) / 60);
    return `${m}m window`;
  }, [ov.windowSec]);

  return (
    <>
      <header className="topbar">
        <div className="topbarLeft">
          <div className="pageTitle">
            <div className="h1">Security</div>
            <div className="h2">Abuse monitor & security events</div>
          </div>
        </div>

        <div className="topbarRight">
          <div className="toggle">
            <input id="demoMode" type="checkbox" checked={demoMode} onChange={(e) => setDemoMode(e.target.checked)} />
            <label htmlFor="demoMode">Demo</label>
          </div>

          <div className="toggle">
            <input id="autoRefreshSec" type="checkbox" checked={autoRefresh} onChange={(e) => setAutoRefresh(e.target.checked)} />
            <label htmlFor="autoRefreshSec">Auto</label>
          </div>

          <div className="select compact">
            <select value={pollMs} onChange={(e) => setPollMs(parseInt(e.target.value, 10))}>
              <option value={1000}>1s</option>
              <option value={2000}>2s</option>
              <option value={5000}>5s</option>
            </select>
            <IconChevron />
          </div>

          <button className="btn" onClick={refresh}>
            <IconRefresh /> Refresh
          </button>
        </div>
      </header>

      <section className="cards">
        <MetricCard title="Rate-limit hits" value={String(ov.rateLimitHits)} sub={windowLabel} tone="gray" icon={<IconAlert />} />
        <MetricCard title="Invalid join tickets" value={String(ov.invalidJoinTickets)} sub="expired / malformed" tone="orange" icon={<IconAlert />} />
        <MetricCard title="Replay detected" value={String(ov.replayDetected)} sub="one-time ticket reuse" tone="red" icon={<IconAlert />} />
        <MetricCard title="Suspicious bursts" value={String(ov.suspiciousBursts)} sub="join spike heuristic" tone="violet" icon={<IconAlert />} />
      </section>

      <section className="panel">
        <div className="panelHead">
          <div>
            <div className="panelTitle">Recent security events</div>
            <div className="panelSub">{loading ? "loading…" : `events: ${events.events.length}`}</div>
          </div>
          <div className="panelRight">
            <div className="panelKpi"><span className="k">WS drops</span><span className="v">{ov.wsQueueDrops}</span></div>
          </div>
        </div>

        <SecurityEventsTable events={events.events} loading={loading} />
      </section>
    </>
  );
}