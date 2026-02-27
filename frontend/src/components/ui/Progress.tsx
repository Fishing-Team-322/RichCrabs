interface ProgressProps {
  value: number
  label?: string
}

export const Progress = ({ value, label }: ProgressProps) => {
  const normalized = Math.max(0, Math.min(100, value))
  return (
    <div>
      {label && <div className="ui-label">{label}</div>}
      <div className="ui-progress" role="progressbar" aria-valuenow={Math.round(normalized)} aria-valuemin={0} aria-valuemax={100}>
        <div className="ui-progress-value" style={{ width: `${normalized}%` }} />
      </div>
    </div>
  )
}
