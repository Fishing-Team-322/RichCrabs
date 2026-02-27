export type ToastVariant = 'success' | 'error' | 'info'

export type ToastItem = { id: string; message: string; variant?: ToastVariant }

const ariaLabelByVariant: Record<ToastVariant, string> = {
  success: 'Системное уведомление об успешном действии',
  error: 'Системное уведомление об ошибке',
  info: 'Системное информационное уведомление',
}

export const ToastStack = ({ items }: { items: ToastItem[] }) => (
  <div className="ui-toast-stack" aria-label="Системные уведомления">
    {items.map((item) => (
      <div
        key={item.id}
        className={`ui-toast ${item.variant ?? 'info'}`}
        role={item.variant === 'error' ? 'alert' : 'status'}
        aria-live={item.variant === 'error' ? 'assertive' : 'polite'}
        aria-atomic="true"
        aria-label={ariaLabelByVariant[item.variant ?? 'info']}
      >
        {item.message}
      </div>
    ))}
  </div>
)
