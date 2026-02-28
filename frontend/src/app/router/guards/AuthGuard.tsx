import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAppSelector } from '../../../store/hooks'
import { routes } from '../routeMap'

const AuthGuard = () => {
  const location = useLocation()
  const { profile, isInitialized, isLoading } = useAppSelector((state) => state.auth)

  if (!isInitialized || isLoading) {
    return <div className="routeState">Проверяем сессию...</div>
  }

  if (!profile) {
    const returnTo = `${location.pathname}${location.search}`
    return <Navigate to={`${routes.authLogin}?returnTo=${encodeURIComponent(returnTo)}`} replace />
  }

  return <Outlet />
}

export default AuthGuard
