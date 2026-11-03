import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react'
import { useFocusTrap } from '../lib/useFocusTrap'

// One accessible replacement for window.confirm().
//
//   const confirm = useConfirm()
//   if (!(await confirm({
//     title: 'Remove Gulf Oysters?',
//     message: 'This cannot be undone.',
//     confirmLabel: 'Remove',
//   }))) return
//
// It names the thing being removed in the title, puts focus on Cancel (so a
// stray Enter never deletes anything), traps focus while open, and Escape or
// a tap outside cancels. Rendered as a bottom sheet on a phone.

const ConfirmContext = createContext(() => Promise.resolve(false)) // no provider: refuse rather than act unasked

export function ConfirmProvider({ children }) {
  const [request, setRequest] = useState(null)
  const pending = useRef(null)

  const confirm = useCallback((options) => new Promise((resolve) => {
    // A second request while one is open cancels the first.
    pending.current?.(false)
    pending.current = resolve
    setRequest(options)
  }), [])

  const settle = useCallback((answer) => {
    pending.current?.(answer)
    pending.current = null
    setRequest(null)
  }, [])

  const value = useMemo(() => confirm, [confirm])

  return (
    <ConfirmContext.Provider value={value}>
      {children}
      {request && <ConfirmDialog {...request} onAnswer={settle} />}
    </ConfirmContext.Provider>
  )
}

export function useConfirm() {
  return useContext(ConfirmContext)
}

function ConfirmDialog({ title, message, confirmLabel = 'Confirm', cancelLabel = 'Cancel', danger = true, onAnswer }) {
  const ref = useFocusTrap(() => onAnswer(false), { initialFocus: '[data-autofocus]' })
  return (
    <div className="sheet-scrim" role="presentation" onClick={() => onAnswer(false)}>
      <div
        ref={ref}
        className="sheet confirm-sheet"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby={message ? 'confirm-message' : undefined}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="confirm-title">{title}</h3>
        {message && <p id="confirm-message" className="claim-sub">{message}</p>}
        <div className="sheet-actions">
          <button type="button" data-autofocus onClick={() => onAnswer(false)}>{cancelLabel}</button>
          <button type="button" className={danger ? 'danger-solid' : 'primary'} onClick={() => onAnswer(true)}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
