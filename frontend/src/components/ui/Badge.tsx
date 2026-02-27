export const Badge = ({ tone = 'neutral', children }: { tone?: 'success' | 'warning' | 'danger' | 'neutral'; children: string }) => (
  <span className={`ui-badge ${tone}`}>{children}</span>
)
