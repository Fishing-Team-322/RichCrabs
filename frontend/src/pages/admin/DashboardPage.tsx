import { useEffect } from 'react'
import { useOutletContext } from 'react-router-dom'
import DashboardContent from './Dashboard'
import type { AdminOutletContext } from '../../components/admin/AdminLayout'

const AdminDashboardPage = () => {
  const { setStatus, setTotals } = useOutletContext<AdminOutletContext>()

  useEffect(() => {
    return () => {
      setTotals(0, 0)
    }
  }, [setTotals])

  return <DashboardContent onStatus={setStatus} onTotals={setTotals} />
}

export default AdminDashboardPage
