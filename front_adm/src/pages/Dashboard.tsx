import React, { useMemo, useState } from "react";
import { api } from "../api";
import type { Overview, RoomsList, RoomDetails, RoomRow } from "../types";
import { useInterval } from "../hooks/useInterval";
import { MetricCard } from "../components/MetricCard";
import { RoomsTable } from "../components/RoomsTable";
import { Drawer } from "../components/Drawer";
import { IconChevron, IconRefresh, IconSearch, IconRooms } from "../components/Icons";

type SortKey = "players_desc" | "players_asc" | "ws_desc" | "ws_asc" | "room_asc" | "room_desc";
type LifecycleFilter = "all" | "lobby" | "in_game" | "finished" | "unknown";

export function DashboardPage(props: {
  onStatus: (ok: boolean, text: string, updatedAt: number | null) => void;
  onTotals: (rooms: number, players: number) => void;
}) {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [rooms, setRooms] = useState<RoomsList>({ rooms: [] });

  const [search, setSearch] = useState("");
  const [lifecycle, setLifecycle] = useState<LifecycleFilter>("all");
  const [sortKey, setSortKey] = useState<SortKey>("players_desc");

  const [autoRefresh, setAutoRefresh] = useState(true);
  const [pollMs, setPollMs] = useState(2000);

  const [loading, setLoading] = useState(false);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerLoading, setDrawerLoading] = useState(false);
  const [details, setDetails] = useState<RoomDetails | null>(null);

  const totals = useMemo(() => {
    const rs = rooms.rooms ?? [];
    return {
      rooms: rs.length,
      players: rs.reduce((a, r) => a + (r.players?.length ?? 0), 0),
      ws: rs.reduce((a, r) => a + (r.wsConnections ?? 0), 0),
    };
  }, [rooms]);

  const filteredRooms = useMemo(() => {
    let list = (rooms.rooms ?? []).slice();
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

  async function refresh() {
    try {
      setLoading(true);
      const [o, r] = await Promise.all([api.overview(), api.rooms()]);
      setOverview(o);
      setRooms(r);

      props.onTotals(r.rooms.length, r.rooms.reduce((a, x) => a + (x.players?.length ?? 0), 0));
      props.onStatus(true, "OK", Date.now());
    } catch (e: any) {
      props.onStatus(false, e?.message ?? "error", null);
    } finally {
      setLoading(false);
    }
  }

  useInterval(() => {
    if (!autoRefresh) return;
    refresh();
  }, autoRefresh ? pollMs : null);

  // first load
  React.useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function openRoom(roomId: string) {
    setDrawerOpen(true);
    setDrawerLoading(true);
    setDetails(null);
    try {
      const d = await api.room(roomId);
      setDetails(d);
    } catch (e: any) {
      props.onStatus(false, e?.message ?? "failed to load room", null);
    } finally {
      setDrawerLoading(false);
    }
  }

  const grpcLabel = overview ? (overview.grpcHealth ? "Healthy" : "Degraded") : "—";

  return (
    <>
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
            <input id="autoRefreshDash" type="checkbox" checked={autoRefresh} onChange={(e) => setAutoRefresh(e.target.checked)} />
            <label htmlFor="autoRefreshDash">Auto</label>
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
        <MetricCard title="Active rooms" value={String(overview?.activeRooms ?? 0)} sub="rooms currently tracked" tone="gray" icon={<IconRooms />} />
        <MetricCard title="WS connections" value={String(overview?.wsConnections ?? 0)} sub="live websocket sessions" tone="gray" />
        <MetricCard title="Queue drops" value={String(overview?.wsQueueDrops ?? 0)} sub="backpressure protection" tone="gray" />
        <MetricCard title="gRPC health" value={grpcLabel} sub="gateway → rust path" tone={overview?.grpcHealth ? "green" : "red"} />
      </section>

      <section className="panel">
        <div className="panelHead">
          <div>
            <div className="panelTitle">Rooms</div>
            <div className="panelSub">
              Showing <b>{filteredRooms.length}</b> of <b>{rooms.rooms.length}</b>
            </div>
          </div>
          <div className="panelRight">
            <div className="panelKpi"><span className="k">Total players</span><span className="v">{totals.players}</span></div>
            <div className="panelKpi"><span className="k">Total WS</span><span className="v">{totals.ws}</span></div>
          </div>
        </div>

        <RoomsTable rooms={filteredRooms} loading={loading} onOpenRoom={openRoom} />
      </section>

      <Drawer open={drawerOpen} loading={drawerLoading} details={details} onClose={() => setDrawerOpen(false)} />
    </>
  );
}