import { useEffect, useRef, useState } from 'react'
import { decideLanding } from '../lib/dashboardView'
import { claimNewAccountMarker, loadProgress } from './storage'

/**
 * Decides, once per business, whether the setup flow should open by itself.
 * Returns true at most once; the dashboard keeps its own "is it open" state so
 * closing the wizard is not undone by this hook.
 *
 * It makes no requests of its own. The dashboard has already asked for the
 * Store list and swept the business's sections, and passes the counts in once
 * they have arrived (`ready`) — deciding earlier would open the wizard for
 * someone whose sections simply had not loaded yet. The rule itself is
 * decideLanding() in lib/dashboardView.js.
 */
export default function useOnboardingGate(slug, { enabled, ready, ...counts }) {
  const [show, setShow] = useState(false)
  const decidedFor = useRef(null)

  const { sectionCount, populatedCount, installCount, storeKnown } = counts
  useEffect(() => {
    if (!enabled || !ready || !slug || decidedFor.current === slug) return
    decidedFor.current = slug
    claimNewAccountMarker(slug)
    const stored = loadProgress(slug)
    if (decideLanding({ sectionCount, populatedCount, installCount, storeKnown, stored, viewingAsAdmin: false }) === 'wizard') {
      setShow(true)
    }
  }, [slug, enabled, ready, sectionCount, populatedCount, installCount, storeKnown])

  return show
}
