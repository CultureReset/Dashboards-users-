import { useEffect, useState } from 'react'

// Light / dark, chosen by the business and remembered.
//
// Same mechanism as the admin console: the choice is written as `data-theme`
// on the root element and every colour in index.css keys off it, so no
// component needs to know which theme is active.
//
// Three modes rather than two. "system" removes the attribute entirely, which
// hands the decision back to the `prefers-color-scheme` block in the token
// sheet — a phone on night mode gets a dark dashboard without anyone choosing.
// Light and dark set the attribute and win over the system setting in both
// directions, which is the point: a business that wants white at midnight gets
// white at midnight.

export const THEME_KEY = 'gcr_dashboard_theme'
export const THEME_MODES = ['system', 'light', 'dark']

/** The stored choice, or "system" when nothing is stored or storage is blocked. */
export function readStoredTheme() {
  try {
    const saved = localStorage.getItem(THEME_KEY)
    return THEME_MODES.includes(saved) ? saved : 'system'
  } catch {
    // Private browsing, or storage disabled. Not an error — just no memory.
    return 'system'
  }
}

/** Put the choice on the document. Exported so index.html can call it early. */
export function applyTheme(mode) {
  const root = document.documentElement
  if (mode === 'light' || mode === 'dark') root.setAttribute('data-theme', mode)
  else root.removeAttribute('data-theme')
}

export function useTheme() {
  const [mode, setMode] = useState(readStoredTheme)

  useEffect(() => {
    applyTheme(mode)
    try {
      localStorage.setItem(THEME_KEY, mode)
    } catch {
      // The theme still applies for this session; it just won't be remembered.
    }
  }, [mode])

  return [mode, setMode]
}

export default useTheme
