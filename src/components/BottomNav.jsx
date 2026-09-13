// One tab per discovered section, plus a permanent Add tab.
//
// Add is always present, including when a business has no sections at all —
// that is the whole point of it. A business that has never entered anything
// still gets a way in.
export default function BottomNav({
  sections, activeKey, onSelect, onAdd, adding, onApps, apps, onBookings, bookings,
}) {
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
      {onBookings && (
        <button
          className={`bottom-nav-item${bookings ? ' active' : ''}`}
          onClick={onBookings}
        >
          <span className="bottom-nav-icon">📅</span>
          <span className="bottom-nav-label">Bookings</span>
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
