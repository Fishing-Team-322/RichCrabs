export type ToastItem = { id: string; message: string }

export const ToastStack = ({ items }: { items: ToastItem[] }) => (
  <div className="ui-toast-stack">
    {items.map((item) => (
      <div key={item.id} className="ui-toast">
        {item.message}
      </div>
    ))}
  </div>
)
