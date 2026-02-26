import React, { useEffect, useMemo, useRef, useState } from "react";
import { api, setToken as saveToken } from "./api.ts";
import type { Overview, RoomsList, RoomDetails, RoomRow } from "./types.ts";

type SortKey = "players_desc" | "players_asc" | "ws_desc" | "ws_asc" | "room_asc" | "room_desc";
type LifecycleFilter = "all" | "lobby" | "in_game" | "finished" | "unknown";

function cn(...xs: Array<string | false | undefined | null>) {
  return xs.filter(Boolean).join(" ");
}

function formatSmall(n: number | string) {
  if (typeof n === "string") return n;
  if (!Number.isFinite(n)) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000) return `${Math.round(n / 1000)}k`;
  return String(n);
}

function lifecycleBadge(state?: string) {
  const s = (state || "").toLowerCase();
  if (s.includes("lobby")) return { label: "Lobby", tone: "info" as const };
  if (s.includes("game") || s.includes("play") || s.includes("in_game")) return { label: "In-game", tone: "ok" as const };
  if (s.includes("finish") || s.includes("done")) return { label: "Finished", tone: "muted" as const };
  return { label: state ? state : "—", tone: "muted" as const };
}

function tokenFromStorage() {
  return localStorage.getItem("admin_token") || "";
}

export default function App() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [rooms, setRooms] = useState<RoomsList | null>(null);

  const [statusOk, setStatusOk] = useState<boolean>(false);
  const [statusText, setStatusText] = useState<string>("Connecting…");
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null);

  const [autoRefresh, setAutoRefresh] = useState<boolean>(true);
  const [pollMs, setPollMs] = useState<number>(2000);
  const pollRef = useRef<number>(pollMs);
  pollRef.current = pollMs;

  const [search, setSearch] = useState<string>("");
  const [lifecycle, setLifecycle] = useState<LifecycleFilter>("all");
  const [sortKey, setSortKey] = useState<SortKey>("players_desc");

  const [drawerOpen, setDrawerOpen] = useState<boolean>(false);
  const [drawerLoading, setDrawerLoading] = useState<boolean>(false);
  const [details, setDetails] = useState<RoomDetails | null>(null);

  const [tokenModalOpen, setTokenModalOpen] = useState<boolean>(false);
  const [tokenDraft, setTokenDraft] = useState<string>(tokenFromStorage());

  const [loadingOverview, setLoadingOverview] = useState<boolean>(false);
  const [loadingRooms, setLoadingRooms] = useState<boolean>(false);

  const totals = useMemo(() => {
    const rs = rooms?.rooms ?? [];
    return {
      rooms: rs.length,
      players: rs.reduce((a, r) => a + (r.players?.length ?? 0), 0),
      ws: rs.reduce((a, r) => a + (r.wsConnections ?? 0), 0),
    };
  }, [rooms]);

  const filteredRooms = useMemo(() => {
    let list = (rooms?.rooms ?? []).slice();
    const q = search.trim().toLowerCase();
    if (q) list = list.filter((r) => r.roomId.toLowerCase().includes(q));

    if (lifecycle !== "all") {
      list = list.filter((r) => {
        const st = (r.lifecycleState || "").toLowerCase();
        if (!st) return lifecycle === "unknown";
        if (lifecycle === "lobby") return st.includes("lobby");
        if (lifecycle === "in_game") return st.includes("game") || st.includes("in_game") || st.includes("play");
        if (lifecycle === "finished") return st.includes("finish") || st.includes("done");
        return false;
      });
    }

    const playersCount = (r: RoomRow) => r.players?.length ?? 0;
    const wsCount = (r: RoomRow) => r.wsConnections ?? 0;

    list.sort((a, b) => {
      switch (sortKey) {
        case "players_desc": return playersCount(b) - playersCount(a);
        case "players_asc": return playersCount(a) - playersCount(b);
        case "ws_desc": return wsCount(b) - wsCount(a);
        case "ws_asc": return wsCount(a) - wsCount(b);
        case "room_desc": return b.roomId.localeCompare(a.roomId);
        case "room_asc": return a.roomId.localeCompare(b.roomId);
        default: return 0;
      }
    });

    return list;
  }, [rooms, search, lifecycle, sortKey]);

  async function refreshAll() {
    try {
      setLoadingOverview(true);
      setLoadingRooms(true);

      const [o, r] = await Promise.all([api.overview(), api.rooms()]);
      setOverview(o);
      setRooms(r);

      setStatusOk(true);
      setStatusText("OK");
      setLastUpdatedAt(Date.now());
    } catch (e: any) {
      setStatusOk(false);
      setStatusText(e?.message ?? "error");
    } finally {
      setLoadingOverview(false);
      setLoadingRooms(false);
    }
  }

  useEffect(() => {
    refreshAll();
  }, []);

  useEffect(() => {
    if (!autoRefresh) return;
    const t = window.setInterval(() => refreshAll(), pollRef.current);
    return () => window.clearInterval(t);
  }, [autoRefresh]);

  async function openRoom(roomId: string) {
    setDrawerOpen(true);
    setDrawerLoading(true);
    setDetails(null);

    try {
      const d = await api.room(roomId);
      setDetails(d);
    } catch (e: any) {
      setDetails(null);
      setStatusOk(false);
      setStatusText(e?.message ?? "failed to load room");
    } finally {
      setDrawerLoading(false);
    }
  }

  function closeDrawer() {
    setDrawerOpen(false);
    setDetails(null);
  }

  function onOpenTokenModal() {
    setTokenDraft(tokenFromStorage());
    setTokenModalOpen(true);
  }

  function onSaveToken() {
    saveToken(tokenDraft.trim());
    setTokenModalOpen(false);
    refreshAll();
  }

  const updatedLabel = useMemo(() => {
    if (!lastUpdatedAt) return "—";
    const sec = Math.max(0, Math.floor((Date.now() - lastUpdatedAt) / 1000));
    if (sec < 5) return "just now";
    if (sec < 60) return `${sec}s ago`;
    const m = Math.floor(sec / 60);
    return `${m}m ago`;
  }, [lastUpdatedAt, statusOk, statusText]);

  const wsHealth = overview ? (overview.grpcHealth ? "Healthy" : "Degraded") : "—";

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <div className="logo"><div className="logoDot" /></div>
          <div className="brandText">
            <div className="brandTitle">Watchtower</div>
            <div className="brandSub">QuizBattle Admin</div>
          </div>
        </div>

        <nav className="nav">
          <div className="navItem active"><IconGrid /><span>Dashboard</span></div>
          <div className="navItem"><IconRooms /><span>Rooms</span></div>
          <div className="navItem"><IconShield /><span>Security</span><span className="chip">soon</span></div>
        </nav>

        <div className="sidebarBottom">
          <div className="miniStat"><div className="miniK">Rooms</div><div className="miniV">{formatSmall(totals.rooms)}</div></div>
          <div className="miniStat"><div className="miniK">Players</div><div className="miniV">{formatSmall(totals.players)}</div></div>

          <button className="btn ghost" onClick={onOpenTokenModal}><IconKey />Token</button>

          <div className={cn("statusPill", statusOk ? "ok" : "bad")}>
            <span className="dot" />
            <span className="statusText">{statusText}</span>
            <span className="statusTime">{updatedLabel}</span>
          </div>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div className="topbarLeft">
            <div className="pageTitle">
              <div className="h1">Dashboard</div>
              <div className="h2">Live rooms, players & health</div>
            </div>
          </div>

          <div className="topbarRight">
            <div className="field">
              <IconSearch />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search room id…" />
            </div>

            <div className="select">
              <select value={lifecycle} onChange={(e) => setLifecycle(e.target.value as LifecycleFilter)}>
                <option value="all">All states</option>
                <option value="lobby">Lobby</option>
                <option value="in_game">In-game</option>
                <option value="finished">Finished</option>
                <option value="unknown">Unknown</option>
              </select>
              <IconChevron />
            </div>

            <div className="select">
              <select value={sortKey} onChange={(e) => setSortKey(e.target.value as SortKey)}>
                <option value="players_desc">Players ↓</option>
                <option value="players_asc">Players ↑</option>
                <option value="ws_desc">WS conns ↓</option>
                <option value="ws_asc">WS conns ↑</option>
                <option value="room_asc">RoomId A→Z</option>
                <option value="room_desc">RoomId Z→A</option>
              </select>
              <IconChevron />
            </div>

            <div className="toggle">
              <input id="autoRefresh" type="checkbox" checked={autoRefresh} onChange={(e) => setAutoRefresh(e.target.checked)} />
              <label htmlFor="autoRefresh">Auto</label>
            </div>

            <div className="select compact">
              <select value={pollMs} onChange={(e) => setPollMs(parseInt(e.target.value, 10))}>
                <option value={1000}>1s</option>
                <option value={2000}>2s</option>
                <option value={5000}>5s</option>
              </select>
              <IconChevron />
            </div>

            <button className="btn" onClick={refreshAll}><IconRefresh />Refresh</button>
          </div>
        </header>

        <section className="cards">
          <MetricCard title="Active rooms" value={loadingOverview ? "…" : formatSmall(overview?.activeRooms ?? 0)} sub="rooms currently tracked" tone="blue" icon={<IconRooms />} />
          <MetricCard title="WS connections" value={loadingOverview ? "…" : formatSmall(overview?.wsConnections ?? 0)} sub="live websocket sessions" tone="violet" icon={<IconBolt />} />
          <MetricCard title="Queue drops" value={loadingOverview ? "…" : formatSmall(overview?.wsQueueDrops ?? 0)} sub="backpressure protection" tone="orange" icon={<IconWave />} />
          <MetricCard title="gRPC health" value={loadingOverview ? "…" : wsHealth} sub="gateway → rust path" tone={overview?.grpcHealth ? "green" : "red"} icon={<IconPulse />} />
        </section>

        <section className="panel">
          <div className="panelHead">
            <div>
              <div className="panelTitle">Rooms</div>
              <div className="panelSub">Showing <b>{filteredRooms.length}</b> of <b>{rooms?.rooms?.length ?? 0}</b></div>
            </div>
            <div className="panelRight">
              <div className="panelKpi"><span className="k">Total players</span><span className="v">{formatSmall(totals.players)}</span></div>
              <div className="panelKpi"><span className="k">Total WS</span><span className="v">{formatSmall(totals.ws)}</span></div>
            </div>
          </div>

          <div className="tableWrap">
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: 240 }}>RoomId</th>
                  <th style={{ width: 160 }}>State</th>
                  <th style={{ width: 110, textAlign: "right" }}>Players</th>
                  <th style={{ width: 120, textAlign: "right" }}>WS</th>
                  <th style={{ width: 110, textAlign: "right" }}>Queue</th>
                  <th style={{ width: 110 }} />
                </tr>
              </thead>
              <tbody>
                {loadingRooms && (rooms?.rooms?.length ?? 0) === 0 ? (
                  <>
                    <SkeletonRow /><SkeletonRow /><SkeletonRow /><SkeletonRow />
                  </>
                ) : filteredRooms.length === 0 ? (
                  <tr><td colSpan={6} className="empty">No rooms found. Try clearing filters.</td></tr>
                ) : (
                  filteredRooms.map((r) => {
                    const badge = lifecycleBadge(r.lifecycleState);
                    const pCount = r.players?.length ?? 0;
                    return (
                      <tr key={r.roomId}>
                        <td className="mono"><span className="roomId">{r.roomId}</span></td>
                        <td><span className={cn("badge", badge.tone)}>{badge.label}</span></td>
                        <td style={{ textAlign: "right" }}><span className="num">{pCount}</span></td>
                        <td style={{ textAlign: "right" }}><span className="num">{r.wsConnections ?? 0}</span></td>
                        <td style={{ textAlign: "right" }}><span className="num">{r.queueLen ?? 0}</span></td>
                        <td style={{ textAlign: "right" }}>
                          <button className="btn small" onClick={() => openRoom(r.roomId)}>
                            View <IconArrow />
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>
      </main>

      <div className={cn("drawerOverlay", drawerOpen && "open")} onMouseDown={closeDrawer} />
      <aside className={cn("drawer", drawerOpen && "open")} onMouseDown={(e) => e.stopPropagation()}>
        <div className="drawerHead">
          <div>
            <div className="drawerTitle">Room details</div>
            <div className="drawerSub">Live snapshot</div>
          </div>
          <button className="iconBtn" onClick={closeDrawer} aria-label="Close"><IconX /></button>
        </div>

        {drawerLoading ? (
          <div className="drawerBody">
            <div className="skeletonCard" />
            <div className="skeletonCard" />
            <div className="skeletonCard" />
          </div>
        ) : details ? (
          <div className="drawerBody">
            <div className="detailGrid">
              <div className="detailCard"><div className="k">Room</div><div className="v mono">{details.roomId}</div></div>
              <div className="detailCard"><div className="k">State</div><div className="v">{details.lifecycleState}</div></div>
              <div className="detailCard"><div className="k">Players</div><div className="v">{details.players.length}</div></div>
            </div>

            <div className="sectionTitle">Players</div>
            <div className="players">
              {details.players
                .slice()
                .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
                .map((p, idx) => (
                  <div className="playerRow" key={p.playerId}>
                    <div className="rank">{idx + 1}</div>
                    <div className="pMain">
                      <div className="pName">{p.displayName}</div>
                      <div className="pId mono">{p.playerId}</div>
                    </div>
                    <div className="pScore">{p.score ?? 0}</div>
                  </div>
                ))}
            </div>
          </div>
        ) : (
          <div className="drawerBody">
            <div className="emptyCard">No details loaded.</div>
          </div>
        )}
      </aside>

      {tokenModalOpen && (
        <div className="modalOverlay" onMouseDown={() => setTokenModalOpen(false)}>
          <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
            <div className="modalHead">
              <div>
                <div className="modalTitle">Admin token</div>
                <div className="modalSub">Stored locally in this browser</div>
              </div>
              <button className="iconBtn" onClick={() => setTokenModalOpen(false)} aria-label="Close"><IconX /></button>
            </div>

            <div className="modalBody">
              <label className="label">Bearer token</label>
              <input className="input" value={tokenDraft} onChange={(e) => setTokenDraft(e.target.value)} placeholder="dev-admin-token" autoFocus />
              <div className="modalHint">Tip: leave empty in dev if your backend allows it.</div>
            </div>

            <div className="modalFoot">
              <button className="btn ghost" onClick={() => setTokenModalOpen(false)}>Cancel</button>
              <button className="btn" onClick={onSaveToken}>Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function MetricCard(props: {
  title: string;
  value: string;
  sub: string;
  tone: "blue" | "violet" | "orange" | "green" | "red";
  icon: React.ReactNode;
}) {
  return (
    <div className={cn("metric", props.tone)}>
      <div className="metricTop">
        <div className="metricIcon">{props.icon}</div>
        <div className="metricMeta">
          <div className="metricTitle">{props.title}</div>
          <div className="metricSub">{props.sub}</div>
        </div>
      </div>
      <div className="metricValue">{props.value}</div>
      <div className="metricGlow" />
    </div>
  );
}

function SkeletonRow() {
  return (
    <tr>
      <td colSpan={6} style={{ padding: 0 }}>
        <div className="skeletonRow" />
      </td>
    </tr>
  );
}

/* Icons */
function IconGrid() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path d="M4 4h7v7H4V4Zm9 0h7v7h-7V4ZM4 13h7v7H4v-7Zm9 0h7v7h-7v-7Z" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}
function IconRooms() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path d="M4 20V7a2 2 0 0 1 2-2h8v15H6a2 2 0 0 1-2-2Z" stroke="currentColor" strokeWidth="1.6" />
      <path d="M14 8h4a2 2 0 0 1 2 2v10" stroke="currentColor" strokeWidth="1.6" />
      <path d="M8 10h2M8 13h2M8 16h2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
function IconShield() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path d="M12 3 20 7v6c0 5-3.5 9-8 10-4.5-1-8-5-8-10V7l8-4Z" stroke="currentColor" strokeWidth="1.6" />
      <path d="M9 12l2 2 4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function IconKey() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path d="M7 14a5 5 0 1 1 4.5-7H21v4h-3v3h-3v3h-3.5A5 5 0 0 1 7 14Z" stroke="currentColor" strokeWidth="1.6" />
      <path d="M10 10h.01" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
    </svg>
  );
}
function IconSearch() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path d="M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15Z" stroke="currentColor" strokeWidth="1.6" />
      <path d="M21 21l-4.3-4.3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
function IconChevron() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
      <path d="M7 10l5 5 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function IconRefresh() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path d="M21 12a9 9 0 1 1-2.6-6.4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M21 3v6h-6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function IconBolt() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path d="M13 2 3 14h8l-1 8 11-14h-8l0-6Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}
function IconWave() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path d="M3 12c2 0 2-4 4-4s2 8 4 8 2-12 4-12 2 16 4 16 2-8 4-8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
function IconPulse() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path d="M3 12h4l2-6 4 12 2-6h6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function IconArrow() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
      <path d="M10 17l5-5-5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function IconX() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}