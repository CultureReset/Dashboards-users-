// The Ask box's network logic. No React, no globals it cannot be given:
// every function takes `fetch` in its options, so scripts/check-ask.mjs runs
// all of it offline against a stub Paperclip.
//
// It talks to Paperclip only through the dashboard's existing client
// (src/lib/paperclip.js -> the same-origin /api/paperclip proxy). The flow is
// the one the owner's own NODE uses (apps/boxes daemon/src/modules/paperclip.ts):
//
//   POST /companies/<company>/issues {title, description, status:'todo', assigneeAgentId}
//   poll GET /issues/<id> and GET /issues/<id>/comments
//   the last agent comment that does not start with "Warning:" is the answer
//   stop at done / cancelled / blocked / in_review
//
// docs/ASK-BOX.md lists which endpoints are confirmed from code and which are assumed.

import { api, auth, businesses, ApiError } from '../lib/paperclip.js'

/** Statuses after which Paperclip will not change the issue by itself. Same set as the NODE. */
export const FINAL_STATUSES = new Set(['done', 'cancelled', 'blocked', 'in_review'])

export const TIMEOUT_MS = 600_000 // the NODE's PAPERCLIP_ASK_TIMEOUT default (600 s)

/** An error the UI can switch on. `code` is one of the ERROR_CODES. */
export class AskError extends Error {
  constructor(code, message, extra = {}) {
    super(message)
    this.name = 'AskError'
    this.code = code
    Object.assign(this, extra)
  }
}

export const ERROR_CODES = ['signed-out', 'not-configured', 'unreachable', 'forbidden', 'unconfirmed', 'failed']

const defaultSleep = (ms, signal) => new Promise((resolve) => {
  if (signal?.aborted) return resolve()
  const t = setTimeout(done, ms)
  function done() {
    signal?.removeEventListener?.('abort', done)
    clearTimeout(t)
    resolve()
  }
  signal?.addEventListener?.('abort', done, { once: true })
})

const enc = encodeURIComponent

// ── error classification ────────────────────────────────────────────────────

/** Turn whatever the client threw into the code the UI shows. */
export function classifyError(err) {
  const status = err instanceof ApiError || typeof err?.status === 'number' ? err.status : null
  const message = String(err?.message || '')
  if (status === 401) return 'signed-out'
  if (status === 503 && /PAPERCLIP_SERVER_URL/.test(message)) return 'not-configured'
  if (status === 403) return 'forbidden'
  if (status === null || status >= 500) return 'unreachable' // network error, proxy 502, upstream 5xx
  return 'failed'
}

/**
 * Could the request have reached Paperclip and been acted on? A network error
 * after send, or a 5xx, says nothing about whether the issue was created.
 * "Not configured" (the proxy refused before forwarding), 401, 403 and the other
 * 4xx are definite: nothing was created.
 */
export function isAmbiguous(err) {
  const code = classifyError(err)
  return code === 'unreachable'
}

function toAskError(err, fallback) {
  if (err instanceof AskError) return err
  const code = classifyError(err)
  const messages = {
    'signed-out': 'You are not signed in to Paperclip.',
    'not-configured': 'Asking is not switched on for this site: PAPERCLIP_SERVER_URL is not set.',
    unreachable: 'Paperclip could not be reached.',
    forbidden: 'Your Paperclip account is not allowed to do that.',
    failed: fallback || 'Paperclip did not accept the request.',
  }
  return new AskError(code, code === 'failed' && err?.message ? err.message : messages[code], { status: err?.status ?? null })
}

// ── who can the owner ask, and as which company ─────────────────────────────

const rowsOf = (value, keys = ['companies', 'items', 'data']) => {
  if (Array.isArray(value)) return value
  for (const k of keys) if (Array.isArray(value?.[k])) return value[k]
  return []
}

/**
 * Work out whether asking is possible, using the same two calls Platform.jsx
 * makes: GET /auth/get-session, then GET /companies?scope=accessible.
 *
 *   { state: 'ready',          company, companies }
 *   { state: 'choose',         companies }                several, none remembered
 *   { state: 'signed-out' | 'not-configured' | 'unreachable' | 'no-company', message }
 *
 * `remembered` is the company id this browser picked last time for this business.
 */
export async function resolveAccess({ fetch: f, remembered = '' } = {}) {
  let who
  try {
    who = await auth.session(f)
  } catch (err) {
    const e = toAskError(err)
    return { state: e.code === 'failed' || e.code === 'forbidden' ? 'unreachable' : e.code, message: e.message }
  }
  if (!who) return { state: 'signed-out', message: 'You are not signed in to Paperclip.' }

  let mine
  try {
    mine = await businesses.mine(f)
  } catch (err) {
    const e = toAskError(err)
    if (e.code === 'forbidden') return { state: 'no-company', message: 'Your Paperclip account has no company you can use.' }
    return { state: e.code === 'failed' ? 'unreachable' : e.code, message: e.message }
  }
  const companies = rowsOf(mine)
    .filter((c) => c && typeof c.id === 'string' && c.id)
    .map((c) => ({ id: c.id, name: typeof c.name === 'string' && c.name.trim() ? c.name.trim() : 'Unnamed company' }))
  if (companies.length === 0) return { state: 'no-company', message: 'Your Paperclip account has no company yet.' }
  if (companies.length === 1) return { state: 'ready', company: companies[0], companies }
  const picked = companies.find((c) => c.id === remembered)
  if (picked) return { state: 'ready', company: picked, companies }
  return { state: 'choose', companies }
}

// ── the lead agent ──────────────────────────────────────────────────────────

const INACTIVE = /^(terminated|archived|deleted|paused|disabled|inactive)$/i
const norm = (v) => String(v ?? '').trim().toLowerCase()

/**
 * THE LEAD-AGENT RULE. Given a company's agents, pick one by the first rule that
 * applies, skipping agents whose status says they are terminated, archived,
 * paused or disabled:
 *
 *   1. 'ceo'    exactly one agent whose role, title or name is "CEO"
 *   2. 'named'  exactly one agent whose name is "Lead" (what the NODE calls it)
 *   3. 'root'   exactly one agent that reports to nobody (the top of the org chart)
 *   4. 'oldest' the agent created first (createdAt, then position in the list)
 *
 * If a rule matches more than one agent it is skipped (it would be a guess) and
 * the next rule applies; rule 4 always yields someone when any agent is left.
 * No active agents -> null, and the ask is created unassigned.
 *
 * The field names (role, title, name, status, reportsTo, createdAt) are ASSUMED
 * about Paperclip's agent objects; see docs/ASK-BOX.md.
 */
export function pickLeadAgent(agents) {
  const list = rowsOf(agents, ['agents', 'items', 'data'])
    .filter((a) => a && typeof a.id === 'string' && a.id)
    .filter((a) => !INACTIVE.test(String(a.status ?? '')))
  if (list.length === 0) return null
  const one = (pred) => {
    const hits = list.filter(pred)
    return hits.length === 1 ? hits[0] : null
  }
  const ceo = one((a) => [a.role, a.title, a.name].some((v) => norm(v) === 'ceo'))
  if (ceo) return { agent: ceo, rule: 'ceo' }
  const named = one((a) => norm(a.name) === 'lead')
  if (named) return { agent: named, rule: 'named' }
  const root = one((a) => !a.reportsTo)
  if (root) return { agent: root, rule: 'root' }
  const oldest = list
    .map((a, i) => ({ a, i, t: Date.parse(a.createdAt) }))
    .sort((x, y) => (Number.isNaN(x.t) ? Infinity : x.t) - (Number.isNaN(y.t) ? Infinity : y.t) || x.i - y.i)[0].a
  return { agent: oldest, rule: 'oldest' }
}

/**
 * Look up the company's agents and apply the rule. ASSUMED endpoint:
 * GET /companies/<id>/agents. Any failure (404, network, odd shape) is not an
 * error for the ask: it just means no lead, and the issue goes unassigned.
 */
export async function findLeadAgent(companyId, { fetch: f } = {}) {
  try {
    const picked = pickLeadAgent(await api.get(`/companies/${enc(companyId)}/agents`, f))
    if (!picked) return { agentId: null, name: '', rule: null, reason: 'no-agents' }
    return { agentId: picked.agent.id, name: String(picked.agent.name || ''), rule: picked.rule, reason: null }
  } catch (err) {
    if (classifyError(err) === 'signed-out') throw toAskError(err)
    return { agentId: null, name: '', rule: null, reason: 'agents-unavailable' }
  }
}

// ── creating the ask ────────────────────────────────────────────────────────

export const markerFor = (askId) => `[NEXTGENT ask ${askId}]`

export function newAskId() {
  const c = globalThis.crypto
  if (c?.randomUUID) return c.randomUUID()
  const b = Array.from({ length: 16 }, () => Math.floor(Math.random() * 256))
  b[6] = (b[6] & 0x0f) | 0x40
  b[8] = (b[8] & 0x3f) | 0x80
  const h = b.map((x) => x.toString(16).padStart(2, '0')).join('')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}

const oneLine = (v, max) => Array.from(String(v ?? ''), (ch) => (ch.charCodeAt(0) < 32 || ch.charCodeAt(0) === 127 ? ' ' : ch))
  .join('').replace(/\s+/g, ' ').trim().slice(0, max)

/** First line of the question, 90 characters, like the NODE's title. */
export const titleFor = (text) => oneLine(String(text).split('\n').find((l) => l.trim()) || 'Request from the dashboard', 90)

/**
 * What the agent reads. The business name comes from the dashboard's entity;
 * nothing here names a person. The last line is the marker used to find this
 * issue again if the create call's outcome is unknown.
 */
export function buildDescription(text, businessName, askId) {
  const biz = oneLine(businessName, 120)
  const who = biz ? `the owner of ${biz}` : 'the business owner'
  return [
    String(text).trim(),
    '',
    '---',
    `From ${who} via the NEXTGENT dashboard. Answer or do this, then post the final answer as a short plain-language comment on this issue and set the issue to done. Delegate if needed.`,
    markerFor(askId),
  ].join('\n')
}

/**
 * Find an issue this ask already created. ASSUMED endpoint:
 * GET /companies/<id>/issues (with ?q=<uuid>, and without it as a fallback).
 * Rows are matched on the marker in their description; if a row has no
 * description, the issue itself is read (GET /issues/<id>, which the NODE uses).
 * Returns {id, identifier, status} or null; throws if the lookup itself failed.
 */
export async function findAskByMarker(companyId, askId, { fetch: f, limit = 20 } = {}) {
  const marker = markerFor(askId)
  const base = `/companies/${enc(companyId)}/issues`
  let answered = false
  let lastErr = null
  for (const path of [`${base}?q=${enc(askId)}`, base]) {
    let rows
    try {
      rows = rowsOf(await api.get(path, f), ['issues', 'items', 'data'])
      answered = true
    } catch (err) {
      lastErr = err
      continue
    }
    const recent = rows
      .filter((r) => r && typeof r.id === 'string')
      .sort((a, b) => String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? '')))
      .slice(0, limit)
    let reads = 0
    for (const row of recent) {
      let description = row.description
      if (typeof description !== 'string' && reads < 10) {
        reads++
        try {
          description = (await api.get(`/issues/${enc(row.id)}`, f))?.description
        } catch { /* skip this row */ }
      }
      if (typeof description === 'string' && description.includes(marker)) {
        return { id: row.id, identifier: row.identifier ?? row.id, status: row.status ?? 'todo' }
      }
    }
  }
  if (!answered) throw lastErr || new Error('issue search failed')
  return null
}

/**
 * Create the issue for an ask, exactly once.
 *
 *   createAsk(text, { fetch, companyId, businessName, askId?, retry?, leadAgentId?, sleep? })
 *
 * - The description carries the marker `[NEXTGENT ask <uuid>]`.
 * - If the create call fails in a way that does not tell us whether the issue
 *   exists (network error after send, 5xx, an unreadable reply), we search for
 *   the marker BEFORE sending again. Found -> use that issue. Searched and not
 *   found -> send again (at most 3 sends in all). Could not search -> stop with
 *   code 'unconfirmed' rather than risk a duplicate.
 * - A caller retrying a previous ask passes the same `askId` and `retry: true`;
 *   the first thing done then is that same search.
 * - `leadAgentId`: pass a string to use that agent, or null to force unassigned;
 *   left out, findLeadAgent() decides.
 *
 * Resolves {askId, issueId, identifier, status, assigned, leadName, leadRule,
 * assignNote, reconciled}.
 */
export async function createAsk(text, ctx = {}) {
  const { fetch: f, companyId, businessName = '', sleep = defaultSleep, reconcileDelayMs = 1500, maxSends = 3 } = ctx
  const body = String(text ?? '').trim()
  if (!body) throw new AskError('failed', 'Type a question first.')
  if (!companyId) throw new AskError('failed', 'No Paperclip company is selected.')
  const askId = ctx.askId || newAskId()
  const retrying = ctx.retry === true

  const reconcile = async () => {
    try {
      return await findAskByMarker(companyId, askId, { fetch: f })
    } catch (err) {
      if (classifyError(err) === 'signed-out') throw toAskError(err)
      throw new AskError('unconfirmed', 'We could not confirm whether your request reached Paperclip. Check before sending it again.', { askId })
    }
  }
  const found = (issue, lead) => ({
    askId,
    issueId: issue.id,
    identifier: issue.identifier ?? issue.id,
    status: issue.status ?? 'todo',
    assigned: !!lead.agentId,
    leadName: lead.name,
    leadRule: lead.rule,
    assignNote: lead.agentId ? '' : assignNoteFor(lead.reason),
    reconciled: lead.reconciled === true,
  })

  // Who gets it. An explicit id (or null) wins; otherwise the rule decides.
  let lead
  if (ctx.leadAgentId === null) lead = { agentId: null, name: '', rule: null, reason: 'none-chosen' }
  else if (typeof ctx.leadAgentId === 'string' && ctx.leadAgentId) lead = { agentId: ctx.leadAgentId, name: '', rule: 'given', reason: null }
  else lead = await findLeadAgent(companyId, { fetch: f })

  if (retrying) {
    const prior = await reconcile()
    if (prior) return found(prior, { ...lead, reconciled: true })
  }

  const payload = {
    title: titleFor(body),
    description: buildDescription(body, businessName, askId),
    status: 'todo',
    ...(lead.agentId ? { assigneeAgentId: lead.agentId } : {}),
  }

  for (let send = 1; send <= maxSends; send++) {
    try {
      const issue = await api.post(`/companies/${enc(companyId)}/issues`, payload, f)
      if (issue && typeof issue.id === 'string' && issue.id) return found(issue, lead)
      throw new ApiError('Paperclip returned an issue without an id.', 502, null) // created, but unreadable: reconcile
    } catch (err) {
      if (err instanceof AskError) throw err
      if (!isAmbiguous(err)) throw toAskError(err)
      await sleep(reconcileDelayMs)
      const existing = await reconcile()
      if (existing) return found(existing, { ...lead, reconciled: true })
      // Searched, and it is not there: safe to send again.
    }
  }
  throw new AskError('unconfirmed', 'Paperclip did not confirm the request after several tries. Check before sending it again.', { askId })
}

function assignNoteFor(reason) {
  if (reason === 'no-agents') return 'This company has no active agents yet, so the request was left unassigned.'
  if (reason === 'none-chosen') return 'The request was left unassigned.'
  return 'We could not tell which agent leads this company, so the request was left unassigned. Assign it in Paperclip.'
}

// ── following the ask ───────────────────────────────────────────────────────

/** Agent comments only, oldest first, without the "Warning:" ones. */
export function agentComments(raw) {
  return rowsOf(raw, ['comments', 'items', 'data'])
    .filter((c) => c && c.authorType === 'agent' && !String(c.body ?? '').trimStart().startsWith('Warning:'))
    .map((c) => ({ id: c.id ?? null, body: String(c.body ?? ''), createdAt: c.createdAt ?? null }))
    .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)))
}

/** The answer is the newest agent comment. '' when there is none. */
export const answerFrom = (comments) => (comments.length ? comments[comments.length - 1].body : '')

/**
 * Poll one issue until it is final, the hard stop passes, or it is aborted.
 *
 *   pollAsk(issueId, { fetch, sleep, now, signal, onUpdate, immediate,
 *                      firstDelayMs, maxDelayMs, factor, timeoutMs, maxErrors })
 *
 * Waits firstDelayMs (3 s), then x1.5 each round up to maxDelayMs (15 s); stops
 * for good at timeoutMs (600 s, like the NODE). `immediate` checks once before
 * waiting (resuming an ask). One bad round is ignored, as the NODE does; after
 * maxErrors in a row it stops with error 'unreachable', and a 401 stops at once.
 *
 * Resolves {status, answer, comments, final, timedOut, aborted, error}.
 */
export async function pollAsk(issueId, opts = {}) {
  const {
    fetch: f, sleep = defaultSleep, now = Date.now, signal, onUpdate, immediate = false,
    firstDelayMs = 3000, maxDelayMs = 15_000, factor = 1.5, timeoutMs = TIMEOUT_MS, maxErrors = 6,
  } = opts
  const start = now()
  let delay = firstDelayMs
  let errors = 0
  const snap = { status: '', answer: '', comments: [], final: false, timedOut: false, aborted: false, error: null }
  const out = (patch) => ({ ...snap, ...patch })

  if (!immediate) {
    await sleep(Math.min(delay, timeoutMs), signal)
    delay = Math.min(delay * factor, maxDelayMs)
  }
  for (;;) {
    if (signal?.aborted) return out({ aborted: true })
    try {
      const issue = await api.get(`/issues/${enc(issueId)}`, f)
      const comments = agentComments(await api.get(`/issues/${enc(issueId)}/comments`, f))
      errors = 0
      snap.status = String(issue?.status ?? snap.status)
      snap.comments = comments
      snap.answer = answerFrom(comments)
      snap.error = null
      onUpdate?.(out({}))
      if (FINAL_STATUSES.has(snap.status)) return out({ final: true })
    } catch (err) {
      const code = classifyError(err)
      if (code === 'signed-out' || code === 'not-configured') return out({ error: { code, message: toAskError(err).message } })
      if (++errors >= maxErrors) return out({ error: { code: 'unreachable', message: toAskError(err).message } })
    }
    const left = timeoutMs - (now() - start)
    if (left <= 0) return out({ timedOut: true })
    await sleep(Math.min(delay, left), signal)
    delay = Math.min(delay * factor, maxDelayMs)
  }
}

// ── what the owner sees ─────────────────────────────────────────────────────

/**
 * The plain chip for one ask: Working, Done, Needs you or Failed.
 * `ask` is a stored record (src/ask/askStore.js).
 */
export function chipFor(ask) {
  const state = ask.state || 'tracked'
  if (state === 'sending') return { label: 'Working', tone: 'working', detail: 'Sending your request' }
  if (state === 'unconfirmed') return { label: 'Needs you', tone: 'attention', detail: 'Not confirmed' }
  if (state === 'failed') return { label: 'Failed', tone: 'failed', detail: ask.error || 'Could not send' }
  const status = ask.status || 'todo'
  const answered = !!ask.answer
  if (status === 'done') return { label: 'Done', tone: 'done', detail: '' }
  if (status === 'in_review') return answered
    ? { label: 'Done', tone: 'done', detail: 'Waiting for a review' }
    : { label: 'Needs you', tone: 'attention', detail: 'Waiting for a review' }
  if (status === 'blocked') return { label: 'Needs you', tone: 'attention', detail: 'Blocked' }
  if (status === 'cancelled') return { label: 'Failed', tone: 'failed', detail: 'Cancelled' }
  if (ask.assigned === false && status === 'todo') return { label: 'Needs you', tone: 'attention', detail: 'No agent is assigned' }
  return { label: 'Working', tone: 'working', detail: ask.stalled === 'timeout' ? 'Taking longer than usual' : ask.stalled === 'unreachable' ? 'Cannot check right now' : '' }
}

/** Is there anything left to wait for? */
export const isOpen = (ask) => ask.state === 'tracked' && !FINAL_STATUSES.has(ask.status || '') && !!ask.issueId
