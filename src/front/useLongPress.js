import { useCallback, useRef } from 'react'

// Long-press, for entering edit mode the way a phone home screen does.
//
// Returns handlers to spread on the pressable element. Moving more than a few
// pixels cancels (that is a scroll), and the click that follows a long press is
// swallowed so releasing your finger does not also open the app.
//
// Keyboard and screen-reader users never need this: the Edit button does the
// same thing.
export default function useLongPress(onLongPress, { ms = 550, slop = 10 } = {}) {
  const timer = useRef(null)
  const start = useRef(null)
  const fired = useRef(false)

  const cancel = useCallback(() => {
    clearTimeout(timer.current)
    timer.current = null
  }, [])

  return {
    onPointerDown(e) {
      if (e.pointerType === 'mouse' && e.button !== 0) return
      fired.current = false
      start.current = { x: e.clientX, y: e.clientY }
      cancel()
      timer.current = setTimeout(() => {
        fired.current = true
        onLongPress?.()
      }, ms)
    },
    onPointerMove(e) {
      const s = start.current
      if (timer.current && s && Math.hypot(e.clientX - s.x, e.clientY - s.y) > slop) cancel()
    },
    onPointerUp: cancel,
    onPointerCancel: cancel,
    onPointerLeave: cancel,
    // A touch long-press opens the browser's context menu; ours replaces it.
    onContextMenu(e) {
      if (fired.current) e.preventDefault()
    },
    // Capture phase would be cleaner, but React's synthetic click is enough:
    // the handler below runs first and stops the open.
    onClickCapture(e) {
      if (fired.current) {
        fired.current = false
        e.preventDefault()
        e.stopPropagation()
      }
    },
  }
}
