import { ReactNode } from 'react'
import { Button } from './Button'
import { useDialogA11y } from '../../hooks/useDialogA11y'

export const Modal = ({ open, title, onClose, children }: { open: boolean; title: string; onClose: () => void; children: ReactNode }) => {
  const { dialogRef, titleId } = useDialogA11y<HTMLDivElement>(open, onClose)

  if (!open) return null
  return (
    <div className="ui-modal-backdrop" onClick={onClose}>
      <div
        className="ui-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        ref={dialogRef}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id={titleId}>{title}</h3>
        <div style={{ margin: '12px 0' }}>{children}</div>
        <Button onClick={onClose}>Закрыть</Button>
      </div>
    </div>
  )
}
