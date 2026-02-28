import { Navigate, Outlet } from 'react-router-dom'
import { useAppSelector } from '../../../store/hooks'
import { selectIsAdmin } from '../../../store/slices/authSlice'
import { routes } from '../routeMap'

const AdminGuard = () => {
  const isAdmin = useAppSelector(selectIsAdmin)

  if (!isAdmin) {
    return <Navigate to={routes.profile} replace />
  }

  return <Outlet />
}

export default AdminGuard
