import { InputHTMLAttributes } from 'react'

type Props = InputHTMLAttributes<HTMLInputElement> & { label?: string; error?: string }

export const Input = ({ label, error, className = '', ...props }: Props) => (
  <label className="ui-field">
    {label && <span className="ui-label">{label}</span>}
    <input className={`ui-input ${error ? 'error' : ''} ${className}`.trim()} {...props} />
    {error && <span className="ui-help">{error}</span>}
  </label>
)
