export const Tabs = ({ items, active, onChange }: { items: Array<{ key: string; label: string }>; active: string; onChange: (k: string) => void }) => (
  <div className="ui-tabs">
    {items.map((item) => (
      <button key={item.key} type="button" className={`ui-tab ${active === item.key ? 'active' : ''}`} onClick={() => onChange(item.key)}>
        {item.label}
      </button>
    ))}
  </div>
)
