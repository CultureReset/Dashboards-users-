import { useId } from 'react'
import { useFocusTrap } from '../lib/useFocusTrap'

// A bottom sheet (centred on a wide screen) for a form. It reuses the
// dashboard's own .sheet styles and focus trap: focus moves in on open, Tab
// stays inside, Escape closes it, and focus goes back to the button that
// opened it. `onClose` is asked for; the owner of the form decides whether it
// may close (unsaved changes).
export default function Sheet({ title, onClose, children, size }) {
  const titleId = useId()
  const ref = useFocusTrap(() => {
    // A confirm dialog above this sheet also hears Escape: leave it to that one.
    if (document.querySelector('.confirm-sheet')) return
    onClose()
  }, { initialFocus: '[data-autofocus]' })
  return (
    <div className="sheet-scrim" role="presentation">
      <div ref={ref} className={`sheet sa-sheet${size === 'wide' ? ' sa-sheet-wide' : ''}`} role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div className="sheet-head">
          <h3 id={titleId}>{title}</h3>
          <button type="button" className="sheet-close" onClick={onClose} aria-label="Close">{'✕'}</button>
        </div>
        {children}
      </div>
    </div>
  )
}
