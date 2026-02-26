import { Navigate, Outlet } from 'react-router-dom'
import { useAppSelector } from '../../../store/hooks'
import { routes } from '../routeMap'

const GuestGuard = () => {
  const { profile, isInitialized, isLoading } = useAppSelector((state) => state.auth)

  if (!isInitialized || isLoading) {
    return <div className="routeState">Проверяем сессию...</div>
  }

  if (profile) {
    return <Navigate to={routes.profile} replace />
  }

  return <Outlet />
}

export default GuestGuard
