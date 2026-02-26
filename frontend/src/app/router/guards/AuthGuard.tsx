import { Navigate, Outlet } from 'react-router-dom'
import { useAppSelector } from '../../../store/hooks'
import { routes } from '../routeMap'

const AuthGuard = () => {
  const { profile, isInitialized, isLoading } = useAppSelector((state) => state.auth)

  if (!isInitialized || isLoading) {
    return <div className="routeState">Проверяем сессию...</div>
  }

  if (!profile) {
    return <Navigate to={routes.authLogin} replace />
  }

  return <Outlet />
}

export default AuthGuard
