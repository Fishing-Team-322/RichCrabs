import { useMemo, useState } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { routes } from '../app/router/routeMap'

const ScenarioNav = () => {
  const location = useLocation()
  const [menuOpen, setMenuOpen] = useState(false)

  const isHiddenRoute =
    location.pathname.startsWith('/admin') ||
    location.pathname.startsWith('/quiz/')

  const links = useMemo(
    () => [
      { to: routes.home, label: 'Главная' },
      { to: routes.profile, label: 'Профиль' },
      { to: routes.roomsNew, label: 'Создать игру' },
      { to: routes.rooms, label: 'Открытые игры' },
      { to: routes.quizzesNew, label: 'Создать квиз' },
      { to: routes.bots, label: 'Telegram-боты' },
    ],
    [],
  )

  if (isHiddenRoute) return null

  return (
    <div className="scenarioNav" role="navigation" aria-label="Навигация по сценарию">
      <div className="scenarioNavInner">
        <Link to={routes.home} className="scenarioBrand" onClick={() => setMenuOpen(false)}>
          RichCrabs
        </Link>
        <button
          type="button"
          className="scenarioBurger"
          aria-expanded={menuOpen}
          aria-controls="scenario-nav-links"
          onClick={() => setMenuOpen((prev) => !prev)}
        >
          ☰
        </button>
        <nav id="scenario-nav-links" className={`scenarioNavLinks ${menuOpen ? 'open' : ''}`}>
          {links.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={() => setMenuOpen(false)}
              className={({ isActive }) => (isActive ? 'scenarioNavLink active' : 'scenarioNavLink')}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </div>
    </div>
  )
}

export default ScenarioNav
