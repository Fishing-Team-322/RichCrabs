import { useEffect } from 'react'
import { useOutletContext } from 'react-router-dom'
import { SecurityPage as SecurityContent } from '../Security'
import type { AdminOutletContext } from '../../components/admin/AdminLayout'

const AdminSecurityPage = () => {
  const { setStatus, setTotals } = useOutletContext<AdminOutletContext>()

  useEffect(() => {
    setTotals(0, 0)
  }, [setTotals])

  return <SecurityContent onStatus={setStatus} />
}

export default AdminSecurityPage
