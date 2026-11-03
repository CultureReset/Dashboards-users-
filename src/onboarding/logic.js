// The pure rules of the setup flow: steps, state, wording and when to show it.
// No React, no network, no storage — scripts/check-onboarding.mjs runs this
// file directly.

import { isInstallable, recommendApps } from './recommend.js'

/* ── steps ───────────────────────────────────────────────────────────────── */

export const STEPS = ['welcome', 'apps', 'tools', 'done']

export const STEP_TITLES = {
  welcome: 'Welcome',
  apps: 'Pick your apps',
  tools: 'Connect your tools',
  done: 'All set',
}

// Only these can be left out when the server has nothing to offer for them.
const SKIPPABLE_WHEN_UNAVAILABLE = ['apps', 'tools']

export const stepIndex = (step) => Math.max(0, STEPS.indexOf(step))

/** Welcome and Done are always part of the flow; the middle two can vanish. */
const isPresent = (step, unavailable) =>
  !(SKIPPABLE_WHEN_UNAVAILABLE.includes(step) && unavailable.includes(step))

export function nextStep(step, unavailable = []) {
  for (let i = stepIndex(step) + 1; i < STEPS.length; i++) {
    if (isPresent(STEPS[i], unavailable)) return STEPS[i]
  }
  return step
}

export function prevStep(step, unavailable = []) {
  for (let i = stepIndex(step) - 1; i >= 0; i--) {
    if (isPresent(STEPS[i], unavailable)) return STEPS[i]
  }
  return step
}

/** Every step can be skipped except the last, which has nothing left to skip. */
export const canSkip = (step) => step !== 'done'
export const canGoBack = (step, unavailable = []) => prevStep(step, unavailable) !== step

/* ── wizard state ────────────────────────────────────────────────────────── */

export function initialState(saved) {
  const base = { step: 'welcome', industry: null, manual: {}, skipped: {}, results: {} }
  if (!saved) return base
  return {
    ...base,
    // A finished setup reopens at the start; an abandoned one resumes.
    step: saved.completed ? 'welcome' : STEPS.includes(saved.step) ? saved.step : 'welcome',
    industry: typeof saved.industry === 'string' && saved.industry ? saved.industry : null,
    manual: saved.manual && typeof saved.manual === 'object' ? { ...saved.manual } : {},
    skipped: saved.skipped && typeof saved.skipped === 'object' ? { ...saved.skipped } : {},
  }
}

export function reduce(state, action) {
  switch (action.type) {
    case 'next':
      return { ...state, step: nextStep(state.step, action.unavailable) }
    case 'back':
      return { ...state, step: prevStep(state.step, action.unavailable) }
    case 'skip': {
      if (!canSkip(state.step)) return state
      return {
        ...state,
        skipped: { ...state.skipped, [state.step]: true },
        step: nextStep(state.step, action.unavailable),
      }
    }
    case 'industry':
      // Recommendations follow the industry until the person touches a switch.
      return { ...state, industry: action.value || null }
    case 'toggle':
      return { ...state, manual: { ...state.manual, [action.id]: !!action.value } }
    case 'result':
      return { ...state, results: { ...state.results, [action.id]: action.result } }
    case 'clearResult': {
      const results = { ...state.results }
      delete results[action.id]
      return { ...state, results }
    }
    default:
      return state
  }
}

/** The part of the state worth remembering between visits. */
export const persistable = (state) => ({
  step: state.step,
  industry: state.industry,
  manual: state.manual,
  skipped: state.skipped,
})

/* ── which apps are switched on ──────────────────────────────────────────── */

/** Recommendations, overridden by whatever the person switched themselves. */
export function switchedOn(items, industry, manual = {}) {
  const on = new Set(recommendApps(items, industry))
  for (const [id, value] of Object.entries(manual)) {
    if (value) on.add(id)
    else on.delete(id)
  }
  // A switch for something no longer installable (removed, already installed)
  // must not count.
  const installable = new Set((Array.isArray(items) ? items : []).filter(isInstallable).map((i) => i.id))
  return new Set([...on].filter((id) => installable.has(id)))
}

/** What pressing Continue still has to install: switched on and not done yet. */
export function appsToInstall(items, on, results = {}) {
  return (Array.isArray(items) ? items : []).filter(
    (item) => isInstallable(item) && on.has(item.id) && !['ok', 'needs_access'].includes(results[item.id]?.status),
  )
}

export const pendingAccess = (results = {}) =>
  Object.entries(results).filter(([, r]) => r?.status === 'needs_access').map(([id]) => id)

/* ── wording ─────────────────────────────────────────────────────────────── */

export function priceLabel(item) {
  switch (item?.reason) {
    case 'free': return 'Free'
    case 'plan': return 'In your plan'
    case 'grant': return 'Included for you'
    default: return 'Available'
  }
}

const PERMISSION_WORDS = {
  public_page: 'Show a page for your business that customers can open',
  collect_submissions: 'Collect requests, orders or sign-ups from your customers',
  store_records: 'Save the information it collects in your account',
  owner_settings: 'Add a settings screen to your dashboard',
  read_business: 'See your business information',
  write_business: 'Change your business information',
  send_email: 'Send email on your behalf',
  send_sms: 'Send text messages on your behalf',
  payments: 'Take payments for your business',
  calendar: 'Read and update your calendar',
}

const GENERIC_PERMISSION = 'Extra access to your business account'

/** A permission code in plain words, with a safe fallback for codes we do not know. */
export function permissionWords(code) {
  const key = String(code ?? '').trim()
  if (PERMISSION_WORDS[key]) return PERMISSION_WORDS[key]
  if (!/^[a-z][a-z0-9_.:-]{1,40}$/i.test(key)) return GENERIC_PERMISSION
  const words = key.replace(/[_.:-]+/g, ' ').toLowerCase()
  return `Access to ${words}`
}

/* ── errors ──────────────────────────────────────────────────────────────── */

/**
 * Turn whatever a request threw into something we can show.
 *   unavailable  the server has no such feature yet (404/405/501): skip it
 *   timeout / network  worth a retry
 *   error        the server said something readable, or we say something generic
 */
export function classifyError(err) {
  const status = Number(err?.status) || 0
  if ([404, 405, 501].includes(status)) {
    return { kind: 'unavailable', message: 'This is not switched on for your business yet.' }
  }
  if (status === 0) {
    const timedOut = /timed out/i.test(String(err?.message || ''))
    return timedOut
      ? { kind: 'timeout', message: 'That took too long. Check your connection and try again.' }
      : { kind: 'network', message: 'We could not reach the server. Check your connection and try again.' }
  }
  if (status === 401) return { kind: 'auth', message: 'Your session ended. Sign in again to continue.' }
  const text = String(err?.message || '').trim()
  const readable = text && text.length <= 140 && !text.startsWith('<') && !/^request failed|^endpoint not found/i.test(text)
  return { kind: 'error', message: readable ? text : 'Something went wrong. Please try again.' }
}

/** Why one install failed, in words for the person who pressed Continue. */
export function installMessage(err) {
  const status = Number(err?.status) || 0
  if (status === 403) return 'Your plan does not include this app.'
  if (status === 404) return 'This app is no longer available.'
  return classifyError(err).message
}

/** True when a 409 from install is the "asks for extra access" kind. */
export const asksForAccess = (err) =>
  err?.status === 409 && Array.isArray(err?.body?.permissions) && err.body.permissions.length > 0

/* ── when to show the wizard on its own ──────────────────────────────────── */

/**
 * Open automatically: right after sign-up, and the first time an owner arrives
 * with nothing installed and no data (`sectionCount` = sections with rows). Never for an admin looking at someone else's
 * business, never after it was closed or finished, and never when we could not
 * find out whether anything is installed.
 */
export function shouldAutoShow({ viewingAsAdmin, stored, installedCount, storeKnown, sectionCount = 0 }) {
  if (viewingAsAdmin) return false
  if (stored?.dismissed || stored?.completed) return false
  // Anything already on the business means it is not new: they land on their
  // app grid instead (see decideLanding in lib/dashboardView.js).
  if (sectionCount > 0) return false
  if (storeKnown && installedCount > 0) return false
  if (stored?.fresh) return true
  if (!storeKnown) return false
  return installedCount === 0
}

/** A sign-up marker is only believed for a few minutes. */
export const FRESH_WINDOW_MS = 10 * 60 * 1000
export const isFreshSignup = (at, now = Date.now()) =>
  Number.isFinite(at) && at <= now + 1000 && now - at <= FRESH_WINDOW_MS

/** Validate what came out of storage; anything odd means "nothing stored". */
export function parseStored(raw) {
  if (typeof raw !== 'string' || !raw) return null
  try {
    const value = JSON.parse(raw)
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null
    return {
      step: STEPS.includes(value.step) ? value.step : 'welcome',
      industry: typeof value.industry === 'string' ? value.industry : null,
      manual: value.manual && typeof value.manual === 'object' && !Array.isArray(value.manual) ? value.manual : {},
      skipped: value.skipped && typeof value.skipped === 'object' && !Array.isArray(value.skipped) ? value.skipped : {},
      dismissed: value.dismissed === true,
      completed: value.completed === true,
      fresh: value.fresh === true,
    }
  } catch {
    return null
  }
}

/* ── the summary on the last step ────────────────────────────────────────── */

export function summarize({ items, results, tools, unavailable = [], skipped = {} }) {
  const installed = (Array.isArray(items) ? items : []).filter((i) => i.installed || results?.[i.id]?.status === 'ok')
  const connected = (Array.isArray(tools) ? tools : []).filter((t) => t.connection?.status === 'connected')
  return {
    installed,
    connected,
    appsNote: unavailable.includes('apps')
      ? 'The app store is not open for your business yet. You can add apps later from Store.'
      : !installed.length && skipped.apps ? 'You skipped apps for now. Add them any time from Store.' : '',
    toolsNote: unavailable.includes('tools')
      ? 'Connecting tools is not switched on yet. You can do it later from Tools.'
      : !connected.length && skipped.tools ? 'You skipped tools for now. Connect them any time from Tools.' : '',
  }
}
