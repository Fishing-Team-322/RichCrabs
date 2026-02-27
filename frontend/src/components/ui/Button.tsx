import { ButtonHTMLAttributes } from 'react'
import { Loader } from './Loader'

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'ghost'
  loading?: boolean
  fullWidth?: boolean
}

export const Button = ({ variant = 'ghost', loading, fullWidth, children, className = '', disabled, ...props }: Props) => (
  <button
    className={`ui-button ${variant} ${loading ? 'is-loading' : ''} ${className}`.trim()}
    disabled={disabled || loading}
    style={fullWidth ? { width: '100%' } : undefined}
    {...props}
  >
    {loading ? <Loader /> : children}
  </button>
)
