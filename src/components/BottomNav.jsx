// One tab per discovered section, plus the permanent ones.
//
// Add is always present, including when a business has no sections at all —
// that is the whole point of it. A business that has never entered anything
// still gets a way in.
//
// Pages is permanent for a different reason: the links it edits are columns on
// the entity record rather than rows in a slug table, so discovery structurally
// cannot produce a tab for them. See src/pages/Pages.jsx.
export default function BottomNav({ sections, activeKey, onSelect, onAdd, adding, onApps, apps, onPages, pages }) {
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
      {onPages && (
        <button
          className={`bottom-nav-item${pages ? ' active' : ''}`}
          onClick={onPages}
        >
          <span className="bottom-nav-icon">🔗</span>
          <span className="bottom-nav-label">Pages</span>
        </button>
      )}
      {onApps && (
        <button
          className={`bottom-nav-item${apps ? ' active' : ''}`}
          onClick={onApps}
        >
          <span className="bottom-nav-icon">🧩</span>
          <span className="bottom-nav-label">Tools</span>
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
