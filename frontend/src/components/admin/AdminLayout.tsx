import { useMemo, useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { routes } from '../../app/router/routeMap'
import { IconGrid, IconKey, IconRooms, IconShield } from '../Icons'
import { TokenModal } from '../TokenModal'
import '../../styles/admin.css'

export interface AdminOutletContext {
  setStatus: (ok: boolean, text: string, updatedAt: number | null) => void
  setTotals: (rooms: number, players: number) => void
}

const formatUpdatedAt = (timestamp: number | null) => {
  if (!timestamp) {
    return '—'
  }

  return new Date(timestamp).toLocaleTimeString()
}

const AdminLayout = () => {
  const [tokenModalOpen, setTokenModalOpen] = useState(false)
  const [roomsTotal, setRoomsTotal] = useState(0)
  const [playersTotal, setPlayersTotal] = useState(0)
  const [status, setStatusState] = useState({ ok: false, text: '—', updatedAt: null as number | null })

  const outletContext = useMemo<AdminOutletContext>(
    () => ({
      setStatus: (ok, text, updatedAt) => setStatusState({ ok, text, updatedAt }),
      setTotals: (rooms, players) => {
        setRoomsTotal(rooms)
        setPlayersTotal(players)
      },
    }),
    [],
  )

  return (
    <div className="adminRoot">
      <div className="app">
        <aside className="sidebar">
          <div className="brand">
            <div className="logo" aria-hidden="true">
              <div className="logoDot" />
            </div>
            <div>
              <div className="brandTitle">RichCrabs Admin</div>
              <div className="brandSub">Realtime control panel</div>
            </div>
          </div>

          <nav className="nav" aria-label="Admin navigation">
            <NavLink to={routes.adminDashboard} className={({ isActive }) => (isActive ? 'navItem active' : 'navItem')}>
              <IconGrid />
              Dashboard
            </NavLink>
            <NavLink to={routes.adminSecurity} className={({ isActive }) => (isActive ? 'navItem active' : 'navItem')}>
              <IconShield />
              Security
              <span className="chip">live</span>
            </NavLink>
          </nav>

          <div className="sidebarBottom">
            <div className="miniStat">
              <span className="miniK">
                <IconRooms /> Rooms
              </span>
              <span className="miniV">{roomsTotal}</span>
            </div>
            <div className="miniStat">
              <span className="miniK">Players</span>
              <span className="miniV">{playersTotal}</span>
            </div>
            <div className={status.ok ? 'statusPill ok' : 'statusPill'}>
              <span className="dot" aria-hidden="true" />
              <span className="statusText">{status.text}</span>
              <span className="statusTime">{formatUpdatedAt(status.updatedAt)}</span>
            </div>
            <button className="btn" onClick={() => setTokenModalOpen(true)} type="button">
              <IconKey /> API token
            </button>
          </div>
        </aside>

        <main className="main">
          <Outlet context={outletContext} />
        </main>
      </div>

      <TokenModal
        open={tokenModalOpen}
        onClose={() => setTokenModalOpen(false)}
        onSave={(token) => {
          localStorage.setItem('admin_token', token)
          setTokenModalOpen(false)
        }}
      />
    </div>
  )
}

export default AdminLayout
