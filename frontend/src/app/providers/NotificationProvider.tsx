import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { ToastStack, type ToastItem } from '../../components/ui'

type NotificationVariant = 'success' | 'error' | 'info'

interface NotificationContextValue {
  notify: (message: string, variant?: NotificationVariant) => void
  success: (message: string) => void
  error: (message: string) => void
  info: (message: string) => void
}

const NotificationContext = createContext<NotificationContextValue | null>(null)

const TOAST_LIFETIME_MS = 4200

const NotificationProvider = ({ children }: { children: ReactNode }) => {
  const [items, setItems] = useState<ToastItem[]>([])

  const removeToast = useCallback((id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id))
  }, [])

  const notify = useCallback(
    (message: string, variant: NotificationVariant = 'info') => {
      const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`
      const nextItem: ToastItem = { id, message, variant }
      setItems((prev) => [...prev.slice(-3), nextItem])
      window.setTimeout(() => removeToast(id), TOAST_LIFETIME_MS)
    },
    [removeToast],
  )

  const value = useMemo<NotificationContextValue>(
    () => ({
      notify,
      success: (message) => notify(message, 'success'),
      error: (message) => notify(message, 'error'),
      info: (message) => notify(message, 'info'),
    }),
    [notify],
  )

  return (
    <NotificationContext.Provider value={value}>
      {children}
      <ToastStack items={items} />
    </NotificationContext.Provider>
  )
}

export const useNotifications = () => {
  const context = useContext(NotificationContext)
  if (!context) {
    throw new Error('useNotifications must be used within NotificationProvider')
  }
  return context
}

export default NotificationProvider
