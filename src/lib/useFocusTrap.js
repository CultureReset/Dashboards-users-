import { useEffect, useRef } from 'react'

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * Make a modal dialog behave like one: focus moves in when it opens, Tab and
 * Shift+Tab stay inside it, Escape closes it, the page behind does not scroll,
 * and focus goes back to whatever opened it.
 *
 *   const ref = useFocusTrap(onClose, { initialFocus: '[data-autofocus]' })
 *   <div ref={ref} role="dialog" aria-modal="true" ...>
 *
 * `initialFocus` is a selector inside the dialog; without it (or without a
 * match) the first focusable element gets focus, else the dialog itself.
 */
export function useFocusTrap(onClose, { initialFocus } = {}) {
  const ref = useRef(null)
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  useEffect(() => {
    const root = ref.current
    if (!root) return undefined
    const opener = document.activeElement
    const focusables = () => [...root.querySelectorAll(FOCUSABLE)].filter((el) => el.offsetParent !== null || el === document.activeElement)

    const first = (initialFocus && root.querySelector(initialFocus)) || focusables()[0] || root
    if (first === root && !root.hasAttribute('tabindex')) root.setAttribute('tabindex', '-1')
    first.focus()

    function onKeyDown(e) {
      if (e.key === 'Escape') {
        e.stopPropagation()
        closeRef.current?.()
        return
      }
      if (e.key !== 'Tab') return
      const items = focusables()
      if (!items.length) {
        e.preventDefault()
        return
      }
      const head = items[0]
      const tail = items[items.length - 1]
      if (e.shiftKey && (document.activeElement === head || !root.contains(document.activeElement))) {
        e.preventDefault()
        tail.focus()
      } else if (!e.shiftKey && (document.activeElement === tail || !root.contains(document.activeElement))) {
        e.preventDefault()
        head.focus()
      }
    }

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', onKeyDown, true)
    return () => {
      document.removeEventListener('keydown', onKeyDown, true)
      document.body.style.overflow = previousOverflow
      if (opener && typeof opener.focus === 'function' && document.contains(opener)) opener.focus()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return ref
}
