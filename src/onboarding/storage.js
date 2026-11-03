// What the wizard remembers in this browser. Every access is guarded: storage
// can be blocked (private windows, strict settings) and the wizard must work
// exactly the same, just without a memory.

import { isFreshSignup, parseStored, persistable } from './logic.js'

const KEY_PREFIX = 'gcr_onboarding_v1:'
const NEW_ACCOUNT_KEY = 'gcr_onboarding_new_account'

const keyFor = (slug) => `${KEY_PREFIX}${slug}`

export function loadProgress(slug) {
  if (!slug) return null
  try {
    return parseStored(localStorage.getItem(keyFor(slug)))
  } catch {
    return null
  }
}

/** Merge a patch into what is stored. Returns nothing; failure is silent. */
export function saveProgress(slug, patch) {
  if (!slug) return
  try {
    const current = loadProgress(slug) || {}
    localStorage.setItem(keyFor(slug), JSON.stringify({ ...current, ...patch, at: Date.now() }))
  } catch {
    // No storage: the wizard still works, it just will not resume.
  }
}

export const saveState = (slug, state) => saveProgress(slug, persistable(state))

/** SignUp calls this the moment an account exists, before anyone is signed in. */
export function markNewAccount() {
  try {
    localStorage.setItem(NEW_ACCOUNT_KEY, String(Date.now()))
  } catch {
    // Without storage the "no apps yet" rule still opens the wizard.
  }
}

/**
 * Called once a business is known. If an account was created a moment ago the
 * marker moves onto that business and is spent, so it cannot fire twice.
 */
export function claimNewAccountMarker(slug) {
  if (!slug) return false
  try {
    const at = Number(localStorage.getItem(NEW_ACCOUNT_KEY))
    if (!at) return false
    localStorage.removeItem(NEW_ACCOUNT_KEY)
    if (!isFreshSignup(at)) return false
    const stored = loadProgress(slug)
    if (stored?.dismissed || stored?.completed) return false
    saveProgress(slug, { fresh: true })
    return true
  } catch {
    return false
  }
}
