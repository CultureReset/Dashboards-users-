// What this browser remembers about asks: the recent list and which Paperclip
// company was picked. localStorage only, per business (an admin viewing many
// businesses must not mix them), always in try/catch, and never trusted: a
// stored value is checked field by field before it is used.
//
// Pure functions that take the storage as an argument, so scripts/check-ask.mjs
// can run them under node with a fake one.

const LIST_KEY = 'nextgent_ask_v1:'
const COMPANY_KEY = 'nextgent_ask_company_v1:'

export const MAX_ASKS = 20
export const MAX_AGE_MS = 24 * 60 * 60 * 1000 // an ask older than this is no longer polled

function defaultStorage() {
  try {
    return globalThis.localStorage || null
  } catch {
    return null
  }
}

const str = (v, max) => (typeof v === 'string' ? v.slice(0, max) : '')
const STATES = new Set(['sending', 'tracked', 'unconfirmed', 'failed'])

/** One stored record, checked. null when it is not usable. */
export function cleanAsk(raw) {
  if (!raw || typeof raw !== 'object' || typeof raw.id !== 'string' || !raw.id) return null
  const state = STATES.has(raw.state) ? raw.state : 'tracked'
  const createdAt = Number.isFinite(raw.createdAt) ? raw.createdAt : 0
  return {
    id: raw.id.slice(0, 64),
    text: str(raw.text, 2000),
    createdAt,
    companyId: str(raw.companyId, 64),
    // We never learned whether a 'sending' ask arrived (the page closed mid-send):
    // it is unconfirmed, and "Try again" searches for it before sending.
    state: state === 'sending' ? 'unconfirmed' : state,
    issueId: str(raw.issueId, 64),
    identifier: str(raw.identifier, 40),
    status: str(raw.status, 40),
    answer: str(raw.answer, 20000),
    assigned: raw.assigned !== false,
    leadName: str(raw.leadName, 80),
    assignNote: str(raw.assignNote, 300),
    error: str(raw.error, 300),
    // 'timeout' or 'unreachable' last session: on the next open we start looking again.
    stalled: '',
  }
}

export function loadAsks(slug, storage = defaultStorage()) {
  try {
    const parsed = JSON.parse(storage?.getItem(LIST_KEY + slug) || '[]')
    if (!Array.isArray(parsed)) return []
    return parsed.map(cleanAsk).filter(Boolean).slice(0, MAX_ASKS)
  } catch {
    return []
  }
}

export function saveAsks(slug, asks, storage = defaultStorage()) {
  try {
    if (!storage) return false
    storage.setItem(LIST_KEY + slug, JSON.stringify(asks.slice(0, MAX_ASKS)))
    return true
  } catch {
    return false
  }
}

/** Newest first; replace by id or put on top. */
export function upsertAsk(asks, ask) {
  const i = asks.findIndex((a) => a.id === ask.id)
  if (i === -1) return [ask, ...asks].slice(0, MAX_ASKS)
  const next = asks.slice()
  next[i] = { ...next[i], ...ask }
  return next
}

/** Asks still worth polling: tracked, not final, recent. */
export function resumable(asks, now = Date.now()) {
  return asks.filter((a) => a.state === 'tracked' && a.issueId
    && !['done', 'cancelled', 'blocked', 'in_review'].includes(a.status)
    && now - a.createdAt < MAX_AGE_MS)
}

export function loadCompanyChoice(slug, storage = defaultStorage()) {
  try {
    return str(storage?.getItem(COMPANY_KEY + slug), 64)
  } catch {
    return ''
  }
}

export function saveCompanyChoice(slug, companyId, storage = defaultStorage()) {
  try {
    if (!storage) return false
    storage.setItem(COMPANY_KEY + slug, companyId)
    return true
  } catch {
    return false
  }
}

export function clearCompanyChoice(slug, storage = defaultStorage()) {
  try {
    storage?.removeItem(COMPANY_KEY + slug)
  } catch { /* nothing to do */ }
}
