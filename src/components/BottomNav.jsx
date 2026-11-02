import { useEffect, useRef, useState, useCallback } from 'react'
import { MANAGE_TABS, MANAGE_VIEWS } from '../lib/dashboardView'
import { useFocusTrap } from '../lib/useFocusTrap'

// Bottom navigation.
//
//   [ Setup | Menu | Hours | Photos | ... scrolls ]  [ More ]  [ + Add ]
//
// The business's own data sections live in the scrolling strip (a restaurant
// has six, a charter twelve, and some have twenty-five). The six fixed
// management screens — Store, Tools, My Ghost, Automations, Calendar,
// Platform — used to be appended to that same strip, which pushed them off
// screen and made the bar a wall of 14 tabs. They now sit behind "More", a
// pinned button next to Add, so the strip is only the business's content and
// the management screens are always one tap away.
//
// Add is always present, including when a business has no sections at all —
// that is the whole point of it. A business that has never entered anything
// still gets a way in.
export default function BottomNav({ sections, view, activeKey, onSelect, onShow, automationsCount = 0 }) {
  const [moreOpen, setMoreOpen] = useState(false)
  const stripRef = useRef(null)
  const [edges, setEdges] = useState({ start: false, end: false })

  const manageActive = MANAGE_VIEWS.includes(view)
  const currentKey = view === 'section' ? activeKey : null

  const updateEdges = useCallback(() => {
    const el = stripRef.current
    if (!el) return
    const start = el.scrollLeft > 4
    const end = el.scrollLeft + el.clientWidth < el.scrollWidth - 4
    setEdges((prev) => (prev.start === start && prev.end === end ? prev : { start, end }))
  }, [])

  // Keep the active tab on screen: with twelve sections the one you just
  // picked from the hamburger would otherwise be off to the side.
  useEffect(() => {
    const strip = stripRef.current
    if (!strip) return
    const active = strip.querySelector('[aria-current="page"]')
    if (active) {
      const target = active.offsetLeft - (strip.clientWidth - active.offsetWidth) / 2
      const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
      strip.scrollTo({ left: Math.max(0, target), behavior: reduce ? 'auto' : 'smooth' })
    }
    updateEdges()
  }, [view, currentKey, sections.length, updateEdges])

  useEffect(() => {
    updateEdges()
    window.addEventListener('resize', updateEdges)
    return () => window.removeEventListener('resize', updateEdges)
  }, [updateEdges])

  const current = (isActive) => (isActive ? 'page' : undefined)
  const activeManage = MANAGE_TABS.find((t) => t.view === view)

  return (
    <>
      <nav className="bottom-nav" aria-label="Business navigation">
        <div
          className="bottom-nav-tabs"
          ref={stripRef}
          onScroll={updateEdges}
          data-edge-start={edges.start}
          data-edge-end={edges.end}
        >
          <button
            type="button"
            className={`bottom-nav-item${view === 'setup' ? ' active' : ''}`}
            onClick={() => onShow('setup')}
            aria-current={current(view === 'setup')}
          >
            <span className="bottom-nav-icon" aria-hidden="true">🏠</span>
            <span className="bottom-nav-label">Setup</span>
          </button>
          {sections.map((s) => (
            <button
              type="button"
              key={s.key}
              className={`bottom-nav-item${s.key === currentKey ? ' active' : ''}`}
              onClick={() => onSelect(s.key)}
              aria-current={current(s.key === currentKey)}
            >
              <span className="bottom-nav-icon" aria-hidden="true">{s.icon}</span>
              <span className="bottom-nav-label">{s.label}</span>
            </button>
          ))}
        </div>

        <button
          type="button"
          className={`bottom-nav-item bottom-nav-more${manageActive ? ' active' : ''}`}
          onClick={() => setMoreOpen(true)}
          aria-haspopup="dialog"
          aria-expanded={moreOpen}
          aria-current={current(manageActive)}
        >
          <span className="bottom-nav-icon" aria-hidden="true">
            {activeManage ? activeManage.icon : '⋯'}
            {automationsCount > 0 && !activeManage && <span className="bottom-nav-dot" />}
          </span>
          <span className="bottom-nav-label">{activeManage ? activeManage.label : 'More'}</span>
        </button>

        <button
          type="button"
          className={`bottom-nav-item bottom-nav-add${view === 'add' ? ' active' : ''}`}
          onClick={() => onShow('add')}
          aria-current={current(view === 'add')}
        >
          <span className="bottom-nav-icon" aria-hidden="true">＋</span>
          <span className="bottom-nav-label">Add</span>
        </button>
      </nav>

      {moreOpen && (
        <MoreSheet
          view={view}
          automationsCount={automationsCount}
          onClose={() => setMoreOpen(false)}
          onPick={(next) => {
            setMoreOpen(false)
            onShow(next)
          }}
        />
      )}
    </>
  )
}

function MoreSheet({ view, automationsCount, onClose, onPick }) {
  const ref = useFocusTrap(onClose, { initialFocus: '[aria-current="page"]' })
  return (
    <div className="sheet-scrim" role="presentation" onClick={onClose}>
      <div
        ref={ref}
        className="sheet more-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="more-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sheet-head">
          <h3 id="more-title">Manage your business</h3>
          <button type="button" className="sheet-close" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <ul className="more-list">
          {MANAGE_TABS.map((tab) => (
            <li key={tab.view}>
              <button
                type="button"
                className={`more-item${view === tab.view ? ' active' : ''}`}
                aria-current={view === tab.view ? 'page' : undefined}
                onClick={() => onPick(tab.view)}
              >
                <span className="more-icon" aria-hidden="true">{tab.icon}</span>
                <span className="more-text">
                  <b>{tab.label}</b>
                  <small>{tab.hint}</small>
                </span>
                {tab.view === 'automations' && automationsCount > 0 && (
                  <span className="more-count" aria-label={`${automationsCount} automations`}>{automationsCount}</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
