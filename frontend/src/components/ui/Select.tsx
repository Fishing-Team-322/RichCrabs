import { SelectHTMLAttributes } from 'react'

type Props = SelectHTMLAttributes<HTMLSelectElement> & { label?: string; error?: string }

export const Select = ({ label, error, className = '', children, ...props }: Props) => (
  <label className="ui-field">
    {label && <span className="ui-label">{label}</span>}
    <select className={`ui-select ${error ? 'error' : ''} ${className}`.trim()} {...props}>
      {children}
    </select>
    {error && <span className="ui-help">{error}</span>}
  </label>
)
