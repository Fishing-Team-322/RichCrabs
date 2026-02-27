export type ToastVariant = 'success' | 'error' | 'info'

export type ToastItem = { id: string; message: string; variant?: ToastVariant }

export const ToastStack = ({ items }: { items: ToastItem[] }) => (
  <div className="ui-toast-stack" role="status" aria-live="polite">
    {items.map((item) => (
      <div key={item.id} className={`ui-toast ${item.variant ?? 'info'}`}>
        {item.message}
      </div>
    ))}
  </div>
)
