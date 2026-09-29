// One tab per discovered section, plus a permanent Add tab.
//
// Add is always present, including when a business has no sections at all —
// that is the whole point of it. A business that has never entered anything
// still gets a way in.
export default function BottomNav({ sections, activeKey, onSelect, onAdd, adding, onApps, apps, onGhost, ghost, onAutomations, automations, automationsCount, onStore, store }) {
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
      {onApps && (
        <button
          className={`bottom-nav-item${apps ? ' active' : ''}`}
          onClick={onApps}
        >
          <span className="bottom-nav-icon">🧩</span>
          <span className="bottom-nav-label">Tools</span>
        </button>
      )}
      {onStore && (
        <button
          className={`bottom-nav-item${store ? ' active' : ''}`}
          onClick={onStore}
        >
          <span className="bottom-nav-icon">🏪</span>
          <span className="bottom-nav-label">Store</span>
        </button>
      )}
      {onGhost && (
        <button
          className={`bottom-nav-item${ghost ? ' active' : ''}`}
          onClick={onGhost}
        >
          <span className="bottom-nav-icon">👻</span>
          <span className="bottom-nav-label">My Ghost</span>
        </button>
      )}
      {onAutomations && (
        <button
          className={`bottom-nav-item${automations ? ' active' : ''}`}
          onClick={onAutomations}
        >
          <span className="bottom-nav-icon">
            ⚡
            {automationsCount > 0 && <span className="bottom-nav-count">{automationsCount}</span>}
          </span>
          <span className="bottom-nav-label">Automations</span>
        </button>
      )}
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
