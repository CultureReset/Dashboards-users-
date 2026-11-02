import { useEffect, useState } from 'react'
import { loadStoreItems } from './api'
import { shouldAutoShow } from './logic'
import { claimNewAccountMarker, loadProgress } from './storage'

/**
 * Decides, once per business, whether the setup flow should open by itself.
 * Returns true at most once; the dashboard keeps its own "is it open" state so
 * closing the wizard is not undone by this hook.
 */
export default function useOnboardingGate(slug, { enabled }) {
  const [show, setShow] = useState(false)

  useEffect(() => {
    if (!enabled || !slug) return undefined
    let cancelled = false
    claimNewAccountMarker(slug)
    const stored = loadProgress(slug)
    if (stored?.dismissed || stored?.completed) return undefined

    loadStoreItems()
      .then((items) => ({ storeKnown: true, installedCount: items.filter((i) => i.installed).length }))
      // 404/405/501 or a failure: we cannot tell, so only a fresh sign-up opens it.
      .catch(() => ({ storeKnown: false, installedCount: 0 }))
      .then(({ storeKnown, installedCount }) => {
        if (cancelled) return
        if (shouldAutoShow({ viewingAsAdmin: false, stored: loadProgress(slug), installedCount, storeKnown })) setShow(true)
      })
    return () => { cancelled = true }
  }, [slug, enabled])

  return show
}
