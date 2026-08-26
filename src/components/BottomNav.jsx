// One tab per discovered section, then the fixed tabs, then Add.
//
// Add is always present, including when a business has no sections at all —
// that is the whole point of it. A business that has never entered anything
// still gets a way in.

// The tabs that are not a section. Driven by a list rather than repeated
// markup so a new one is a line here, not another copy of the same button.
const OVERLAYS = [
  { name: 'apps', icon: '🧩', label: 'Tools' },
  { name: 'devices', icon: '📱', label: 'Devices' },
  { name: 'settings', icon: '⚙️', label: 'Settings' },
]

export default function BottomNav({ sections, activeKey, onSelect, onAdd, adding, overlay, onOverlay }) {
  return (
    <nav className="bottom-nav">
      {sections.map((s) => (
        <button
          key={s.key}
          className={`bottom-nav-item${!adding && s.key === activeKey ? ' active' : ''}`}
          onClick={() => onSelect(s.key)}
        >
          <span className="bottom-nav-icon">{s.icon}</span>
          <span className="bottom-nav-label">{s.label}</span>
        </button>
      ))}
      {onOverlay && OVERLAYS.map(({ name, icon, label }) => (
        <button
          key={name}
          className={`bottom-nav-item${overlay === name ? ' active' : ''}`}
          onClick={() => onOverlay(name)}
        >
          <span className="bottom-nav-icon">{icon}</span>
          <span className="bottom-nav-label">{label}</span>
        </button>
      ))}
      {onAdd && (
        <button
          className={`bottom-nav-item bottom-nav-add${adding ? ' active' : ''}`}
          onClick={onAdd}
        >
          <span className="bottom-nav-icon">＋</span>
          <span className="bottom-nav-label">Add</span>
        </button>
      )}
    </nav>
  )
}
