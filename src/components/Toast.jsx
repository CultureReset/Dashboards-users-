import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'

// A short message that appears above the bottom nav and goes away by itself.
//
//   const toast = useToast()
//   toast.success('Saved')
//   toast.error("Couldn't save — check your connection")
//
// Success lasts a few seconds; an error stays longer because it is the one
// the owner has to read. Tapping a toast dismisses it. The same message shown
// twice at once is shown once.

const noop = () => {}
const ToastContext = createContext({ success: noop, error: noop, info: noop })

const LIFETIME = { success: 2800, info: 3500, error: 6500 }

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const nextId = useRef(1)
  const timers = useRef(new Map())

  const dismiss = useCallback((id) => {
    clearTimeout(timers.current.get(id))
    timers.current.delete(id)
    setToasts((list) => list.filter((t) => t.id !== id))
  }, [])

  const push = useCallback((kind, message) => {
    if (!message) return
    const text = String(message)
    setToasts((list) => {
      if (list.some((t) => t.kind === kind && t.message === text)) return list
      const id = nextId.current++
      timers.current.set(id, setTimeout(() => dismiss(id), LIFETIME[kind]))
      return [...list.slice(-2), { id, kind, message: text }]
    })
  }, [dismiss])

  useEffect(() => {
    const live = timers.current
    return () => live.forEach(clearTimeout)
  }, [])

  const api = useMemo(() => ({
    success: (m) => push('success', m),
    error: (m) => push('error', m),
    info: (m) => push('info', m),
  }), [push])

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="toasts" aria-live="polite" aria-atomic="false">
        {toasts.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`toast toast-${t.kind}`}
            role={t.kind === 'error' ? 'alert' : 'status'}
            onClick={() => dismiss(t.id)}
          >
            <span className="toast-icon" aria-hidden="true">{t.kind === 'error' ? '!' : '✓'}</span>
            <span className="toast-text">{t.message}</span>
          </button>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  return useContext(ToastContext)
}
