import { useEffect, useMemo, useState } from 'react'
import { Drawer } from '../../components/Drawer'
import { IconChevron, IconRefresh, IconRooms, IconSearch } from '../../components/Icons'
import { MetricCard } from '../../components/MetricCard'
import { RoomsTable } from '../../components/RoomsTable'
import { useInterval } from '../../hooks/useInterval'
import { monitoringApi } from '../../features/monitoring/api/monitoringApi'
import { mockOverview, mockRoomDetails, mockRoomsList } from '../../features/monitoring/mockDashboard'
import type { Overview, RoomDetails, RoomsList, RoomRow } from '../../features/monitoring/types'

type SortKey = 'players_desc' | 'players_asc' | 'ws_desc' | 'ws_asc' | 'room_asc' | 'room_desc'
type LifecycleFilter = 'all' | 'lobby' | 'in_game' | 'finished' | 'unknown'

type DashboardProps = {
  onStatus?: (ok: boolean, text: string, updatedAt: number | null) => void
  onTotals?: (rooms: number, players: number) => void
}

const Dashboard = ({ onStatus, onTotals }: DashboardProps) => {
  const [overview, setOverview] = useState<Overview | null>(null)
  const [rooms, setRooms] = useState<RoomsList>({ rooms: [] })

  const [search, setSearch] = useState('')
  const [lifecycle, setLifecycle] = useState<LifecycleFilter>('all')
  const [sortKey, setSortKey] = useState<SortKey>('players_desc')

  const [autoRefresh, setAutoRefresh] = useState(true)
  const [pollMs, setPollMs] = useState(2000)
  const [demoMode, setDemoMode] = useState(true)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [drawerOpen, setDrawerOpen] = useState(false)
  const [drawerLoading, setDrawerLoading] = useState(false)
  const [details, setDetails] = useState<RoomDetails | null>(null)

  const totals = useMemo(() => {
    const roomList = rooms.rooms ?? []
    return {
      rooms: roomList.length,
      players: roomList.reduce((acc, room) => acc + (room.players?.length ?? 0), 0),
      ws: roomList.reduce((acc, room) => acc + (room.wsConnections ?? 0), 0),
    }
  }, [rooms])

  const filteredRooms = useMemo(() => {
    let list = (rooms.rooms ?? []).slice()
    const query = search.trim().toLowerCase()
    if (query) {
      list = list.filter((room) => room.roomId.toLowerCase().includes(query))
    }

    if (lifecycle !== 'all') {
      list = list.filter((room) => {
        const state = (room.lifecycleState || '').toLowerCase()
        if (!state) return lifecycle === 'unknown'
        if (lifecycle === 'lobby') return state.includes('lobby')
        if (lifecycle === 'in_game') return state.includes('game') || state.includes('in_game') || state.includes('play')
        if (lifecycle === 'finished') return state.includes('finish') || state.includes('done')
        return false
      })
    }

    const playersCount = (room: RoomRow) => room.players?.length ?? 0
    const wsCount = (room: RoomRow) => room.wsConnections ?? 0

    list.sort((a, b) => {
      switch (sortKey) {
        case 'players_desc': return playersCount(b) - playersCount(a)
        case 'players_asc': return playersCount(a) - playersCount(b)
        case 'ws_desc': return wsCount(b) - wsCount(a)
        case 'ws_asc': return wsCount(a) - wsCount(b)
        case 'room_desc': return b.roomId.localeCompare(a.roomId)
        case 'room_asc': return a.roomId.localeCompare(b.roomId)
        default: return 0
      }
    })

    return list
  }, [rooms, search, lifecycle, sortKey])

  const refresh = async () => {
    try {
      setLoading(true)
      setError(null)

      if (demoMode) {
        setOverview(mockOverview())
        setRooms(mockRoomsList())
        return
      }

      const [nextOverview, nextRooms] = await Promise.all([monitoringApi.overview(), monitoringApi.rooms()])
      setOverview(nextOverview)
      setRooms(nextRooms)
    } catch (apiError) {
      setError(apiError instanceof Error ? apiError.message : 'Не удалось обновить дашборд')
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
    if (!onTotals) return
    onTotals(totals.rooms, totals.players)
  }, [onTotals, totals.players, totals.rooms])

  useEffect(() => {
    if (!onStatus) return
    const ok = overview?.grpcHealth ?? false
    const text = error ? 'Error' : ok ? 'Healthy' : 'Degraded'
    onStatus(ok && !error, text, Date.now())
  }, [error, onStatus, overview?.grpcHealth])

  const openRoom = async (roomId: string) => {
    setDrawerOpen(true)
    setDrawerLoading(true)
    setDetails(null)
    try {
      if (demoMode) {
        setDetails(mockRoomDetails(roomId))
        return
      }

      const roomDetails = await monitoringApi.room(roomId)
      setDetails(roomDetails)
    } catch (apiError) {
      setError(apiError instanceof Error ? apiError.message : 'Не удалось загрузить карточку комнаты')
    } finally {
      setDrawerLoading(false)
    }
  }

  return (
    <>
      <header className="topbar">
        <div className="topbarLeft"><div className="pageTitle"><div className="h1">Admin Dashboard</div><div className="h2">Live rooms, players & health</div></div></div>
        <div className="topbarRight">
          <div className="field"><IconSearch /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search room id…" /></div>
          <div className="select"><select value={lifecycle} onChange={(event) => setLifecycle(event.target.value as LifecycleFilter)}><option value="all">All states</option><option value="lobby">Lobby</option><option value="in_game">In-game</option><option value="finished">Finished</option><option value="unknown">Unknown</option></select><IconChevron /></div>
          <div className="select"><select value={sortKey} onChange={(event) => setSortKey(event.target.value as SortKey)}><option value="players_desc">Players ↓</option><option value="players_asc">Players ↑</option><option value="ws_desc">WS conns ↓</option><option value="ws_asc">WS conns ↑</option><option value="room_asc">RoomId A→Z</option><option value="room_desc">RoomId Z→A</option></select><IconChevron /></div>
          <div className="toggle"><input id="demoModeDash" type="checkbox" checked={demoMode} onChange={(event) => setDemoMode(event.target.checked)} /><label htmlFor="demoModeDash">Demo</label></div>
          <div className="toggle"><input id="autoRefreshDash" type="checkbox" checked={autoRefresh} onChange={(event) => setAutoRefresh(event.target.checked)} /><label htmlFor="autoRefreshDash">Auto</label></div>
          <div className="select compact"><select value={pollMs} onChange={(event) => setPollMs(parseInt(event.target.value, 10))}><option value={1000}>1s</option><option value={2000}>2s</option><option value={5000}>5s</option></select><IconChevron /></div>
          <button className="btn" onClick={() => void refresh()}><IconRefresh /> Refresh</button>
        </div>
      </header>

      {error ? <div className="routeState">{error}</div> : null}

      <section className="cards">
        <MetricCard title="Active rooms" value={String(overview?.activeRooms ?? 0)} sub="rooms currently tracked" tone="gray" icon={<IconRooms />} />
        <MetricCard title="WS connections" value={String(overview?.wsConnections ?? 0)} sub="live websocket sessions" tone="gray" />
        <MetricCard title="Queue drops" value={String(overview?.wsQueueDrops ?? 0)} sub="backpressure protection" tone="gray" />
        <MetricCard title="gRPC health" value={overview ? (overview.grpcHealth ? 'Healthy' : 'Degraded') : '—'} sub="gateway → rust path" tone={overview?.grpcHealth ? 'green' : 'red'} />
      </section>

      <section className="panel">
        <div className="panelHead">
          <div><div className="panelTitle">Rooms</div><div className="panelSub">Showing <b>{filteredRooms.length}</b> of <b>{totals.rooms}</b></div></div>
          <div className="panelRight"><div className="panelKpi"><span className="k">Total players</span><span className="v">{totals.players}</span></div><div className="panelKpi"><span className="k">Total WS</span><span className="v">{totals.ws}</span></div></div>
        </div>

        <RoomsTable rooms={filteredRooms} loading={loading} onOpenRoom={openRoom} />
      </section>

      <Drawer open={drawerOpen} loading={drawerLoading} details={details} onClose={() => setDrawerOpen(false)} />
    </>
  )
}

export default Dashboard
