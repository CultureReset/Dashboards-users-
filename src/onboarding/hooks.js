import { useCallback, useEffect, useRef, useState } from 'react'
import { classifyError } from './logic'

export const SLOW_AFTER_MS = 8000

/**
 * Load something once and offer a retry. `status` is one of
 * loading | ready | unavailable | error. `reload(true)` refreshes quietly,
 * keeping the old data on screen instead of going back to a spinner.
 */
export function useLoader(load) {
  const [state, setState] = useState({ status: 'loading', data: null, error: null })
  const [tick, setTick] = useState({ n: 0, quiet: false })
  const loadRef = useRef(load)
  loadRef.current = load

  useEffect(() => {
    let alive = true
    if (!tick.quiet) setState((s) => ({ ...s, status: 'loading', error: null }))
    Promise.resolve()
      .then(() => loadRef.current())
      .then((data) => { if (alive) setState({ status: 'ready', data, error: null }) })
      .catch((err) => {
        if (!alive) return
        const error = classifyError(err)
        setState((s) => ({
          status: error.kind === 'unavailable' ? 'unavailable' : 'error',
          data: tick.quiet ? s.data : null,
          error,
        }))
      })
    return () => { alive = false }
  }, [tick])

  const reload = useCallback((quiet = false) => setTick((t) => ({ n: t.n + 1, quiet })), [])
  return [state, reload]
}

/** True once `active` has been true for `ms` — for the "taking a while" message. */
export function useSlow(active, ms = SLOW_AFTER_MS) {
  const [slow, setSlow] = useState(false)
  useEffect(() => {
    if (!active) return undefined
    const timer = setTimeout(() => setSlow(true), ms)
    return () => { clearTimeout(timer); setSlow(false) }
  }, [active, ms])
  return active && slow
}
