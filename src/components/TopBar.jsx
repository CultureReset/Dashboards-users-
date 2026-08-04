import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../lib/AuthContext'
import { useTheme, THEME_MODES } from '../lib/useTheme'

const THEME_LABELS = { system: 'Auto', light: 'Light', dark: 'Dark' }

// The hamburger menu.
//
// The bottom nav shows every discovered section, which is fine for a
// restaurant with six and unusable for a business with twenty-five. This is
// the other way through: the same sections as a scrollable list, plus the
// things that belong to the account rather than to a section — appearance and
// sign out.
//
// Sections are optional. The business picker renders this bar with none, and
// the menu is still worth having for the theme switch.
export default function TopBar({ businessName, sections = [], activeKey, onSelect }) {
  const { signOut, viewingAsAdmin, closeBusiness } = useAuth()
  const [theme, setTheme] = useTheme()
  const [open, setOpen] = useState(false)
  const menuRef = useRef(null)
  const buttonRef = useRef(null)

  // Close on outside click and on Escape. Both listeners only exist while the
  // menu is open, so the closed state costs nothing.
  useEffect(() => {
    if (!open) return

    function onPointerDown(e) {
      if (menuRef.current?.contains(e.target)) return
      if (buttonRef.current?.contains(e.target)) return
      setOpen(false)
    }
    function onKeyDown(e) {
      if (e.key === 'Escape') {
        setOpen(false)
        buttonRef.current?.focus()
      }
    }

    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return (
    <>
      {viewingAsAdmin && (
        <div className="admin-banner">
          <span>Admin view</span>
          <button onClick={closeBusiness}>← All businesses</button>
        </div>
      )}
      <header className="topbar">
        <button
          ref={buttonRef}
          className="topbar-burger"
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? 'Close menu' : 'Open menu'}
          aria-expanded={open}
          aria-haspopup="true"
        >
          <span aria-hidden="true">{open ? '✕' : '☰'}</span>
        </button>

        <span className="topbar-brand">{businessName || 'Dashboard'}</span>

        <button className="topbar-signout" onClick={signOut}>
          Sign out
        </button>

        {open && (
          <div className="topbar-menu" ref={menuRef} role="menu">
            {sections.length > 0 && (
              <>
                <p className="topbar-menu-label">Sections</p>
                <div className="topbar-menu-sections">
                  {sections.map((s) => (
                    <button
                      key={s.key}
                      role="menuitem"
                      className={`topbar-menu-item${s.key === activeKey ? ' active' : ''}`}
                      onClick={() => {
                        onSelect?.(s.key)
                        setOpen(false)
                      }}
                    >
                      <span className="topbar-menu-icon">{s.icon}</span>
                      <span>{s.label}</span>
                    </button>
                  ))}
                </div>
              </>
            )}

            <p className="topbar-menu-label">Appearance</p>
            <div className="theme-switch" role="group" aria-label="Appearance">
              {THEME_MODES.map((mode) => (
                <button
                  key={mode}
                  className={`theme-option${theme === mode ? ' active' : ''}`}
                  aria-pressed={theme === mode}
                  onClick={() => setTheme(mode)}
                >
                  {THEME_LABELS[mode]}
                </button>
              ))}
            </div>
            <p className="topbar-menu-help">
              Auto follows your phone or computer. Light and dark override it.
            </p>

            <button
              role="menuitem"
              className="topbar-menu-item topbar-menu-signout"
              onClick={signOut}
            >
              <span className="topbar-menu-icon" aria-hidden="true">↩</span>
              <span>Sign out</span>
            </button>
          </div>
        )}
      </header>
    </>
  )
}
