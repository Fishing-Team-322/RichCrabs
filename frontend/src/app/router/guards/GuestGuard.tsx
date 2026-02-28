import { Navigate, Outlet, useLocation, useSearchParams } from 'react-router-dom'
import { useAppSelector } from '../../../store/hooks'
import { routes } from '../routeMap'

const GuestGuard = () => {
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const { profile, isInitialized, isLoading } = useAppSelector((state) => state.auth)

  if (!isInitialized || isLoading) {
    return <div className="routeState">Проверяем сессию...</div>
  }

  if (profile) {
    const returnTo = searchParams.get('returnTo')
    if (returnTo && location.pathname.startsWith('/auth/')) {
      return <Navigate to={returnTo} replace />
    }
    return <Navigate to={routes.profile} replace />
  }

  return <Outlet />
}

export default GuestGuard
