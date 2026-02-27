import { ReactNode } from 'react'
import { Button } from './Button'

export const Modal = ({ open, title, onClose, children }: { open: boolean; title: string; onClose: () => void; children: ReactNode }) => {
  if (!open) return null
  return (
    <div className="ui-modal-backdrop" onClick={onClose}>
      <div className="ui-modal" onClick={(e) => e.stopPropagation()}>
        <h3>{title}</h3>
        <div style={{ margin: '12px 0' }}>{children}</div>
        <Button onClick={onClose}>Закрыть</Button>
      </div>
    </div>
  )
}
