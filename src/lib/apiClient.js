/**
 * HTTP client.
 *
 * One place that knows how to talk to gcr-api-clean: base URL, auth header,
 * JSON encoding, query strings, timeouts, token renewal, and error
 * normalization. Nothing else in this app calls fetch directly.
 *
 * Deliberately the same shape as Admin-dashboard-main/src/api/client.js. That
 * dashboard has never held a database key, and this one is being rebuilt to
 * match it — so the two stay recognisably the same code rather than drifting
 * into two different ideas of how a request is made.
 */

import { GCR_API_BASE, REQUEST_TIMEOUT_MS } from './config'
import { getToken, refreshNow, clearSession, getActingSlug } from './authStore'

/** Raised for any non-2xx response, carrying enough context to render well. */
export class ApiError extends Error {
  constructor(message, { status = 0, path = '', body = null, cause = null } = {}) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.path = path
    this.body = body
    this.cause = cause
  }

  get isMissingEndpoint() {
    return this.status === 404 || this.status === 405
  }

  get isAuthError() {
    return this.status === 401 || this.status === 403
  }

  /** 403 specifically: signed in, but this account owns no business yet. */
  get isNotLinked() {
    return this.status === 403
  }

  get isNetworkError() {
    return this.status === 0
  }
}

/** Listeners notified when the API rejects our token, so the app can log out. */
const authFailureListeners = new Set()

export function onAuthFailure(listener) {
  authFailureListeners.add(listener)
  return () => authFailureListeners.delete(listener)
}

function notifyAuthFailure(error) {
  for (const listener of authFailureListeners) {
    try {
      listener(error)
    } catch {
      // A misbehaving listener must not break the request path.
    }
  }
}

/**
 * Serialize a query object. Undefined/null/'' are dropped so callers can pass
 * optional filters straight through without pruning them first.
 */
export function buildQuery(params) {
  if (!params) return ''
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue
    if (Array.isArray(value)) {
      for (const entry of value) {
        if (entry !== undefined && entry !== null && entry !== '') search.append(key, String(entry))
      }
    } else {
      search.append(key, String(value))
    }
  }
  const qs = search.toString()
  return qs ? `?${qs}` : ''
}

async function parseBody(response) {
  const contentType = response.headers.get('content-type') || ''
  if (response.status === 204) return null
  if (contentType.includes('application/json')) {
    try {
      return await response.json()
    } catch {
      return null
    }
  }
  try {
    return await response.text()
  } catch {
    return null
  }
}

function messageFrom(body, response, path) {
  if (body && typeof body === 'object') {
    const candidate = body.error || body.message || body.detail
    if (typeof candidate === 'string' && candidate) return candidate
  }
  if (typeof body === 'string' && body.trim() && !body.trim().startsWith('<')) {
    return body.trim().slice(0, 300)
  }
  if (response.status === 404) return `Endpoint not found: ${path}`
  return `Request failed (${response.status} ${response.statusText || ''})`.trim()
}

async function send(url, { method, headers, payload, signal, timeoutMs }) {
  const controller = new AbortController()
  const timer = timeoutMs ? setTimeout(() => controller.abort(), timeoutMs) : null
  const onExternalAbort = () => controller.abort()
  if (signal) {
    if (signal.aborted) controller.abort()
    else signal.addEventListener('abort', onExternalAbort)
  }

  try {
    // `body` is omitted rather than passed as undefined: a GET carrying one is
    // invalid, and some runtimes reject it outright instead of ignoring it.
    const init = { method, headers, signal: controller.signal }
    if (payload !== undefined) init.body = payload
    return await fetch(url, init)
  } finally {
    if (timer) clearTimeout(timer)
    if (signal) signal.removeEventListener('abort', onExternalAbort)
  }
}

/**
 * Core request. Returns the parsed body on success and throws ApiError
 * otherwise.
 *
 * A 401 is retried once against a freshly renewed token before it is believed.
 * The Supabase client used to do this internally; without it, a token that
 * expired between two keystrokes would otherwise sign the owner out mid-edit.
 *
 * @param {string} path      Path from the endpoint registry.
 * @param {object} options
 * @param {string} [options.method='GET']
 * @param {object} [options.body]       JSON-encoded automatically.
 * @param {FormData} [options.formData] Sent as-is (file uploads).
 * @param {object} [options.query]      Appended as a query string.
 * @param {boolean} [options.auth=true] Attach the bearer token.
 * @param {AbortSignal} [options.signal]
 */
export async function request(path, options = {}) {
  const {
    method = 'GET',
    body,
    formData,
    query,
    auth = true,
    signal,
    headers: extraHeaders,
    timeoutMs = REQUEST_TIMEOUT_MS,
  } = options

  // An admin viewing someone else's business owns nothing, so the server has
  // no slug to resolve for them. Carry it on every /api/business call rather
  // than only the reads that took it as an argument — otherwise an admin can
  // see a business's data and gets a 403 the moment they try to change any of
  // it. The server ignores this for everyone platform_admins does not vouch
  // for, so attaching it is never a grant.
  const acting = getActingSlug()
  const withActing =
    acting && path.startsWith('/api/business/') && !query?.slug
      ? { ...query, slug: acting }
      : query

  const fullPath = `${path}${buildQuery(withActing)}`
  const url = `${GCR_API_BASE}${fullPath}`

  let payload
  const baseHeaders = { Accept: 'application/json', ...extraHeaders }
  if (formData) {
    payload = formData // Browser sets the multipart boundary itself.
  } else if (body !== undefined) {
    baseHeaders['Content-Type'] = 'application/json'
    payload = JSON.stringify(body)
  }

  const headersWith = async (forceRefresh) => {
    if (!auth) return baseHeaders
    const token = forceRefresh ? (await refreshNow())?.access_token : await getToken()
    return token ? { ...baseHeaders, Authorization: `Bearer ${token}` } : baseHeaders
  }

  let response
  try {
    response = await send(url, {
      method,
      headers: await headersWith(false),
      payload,
      signal,
      timeoutMs,
    })

    // One retry against a renewed token — but only for a body we can send
    // twice. A FormData stream cannot be replayed.
    if (response.status === 401 && auth && !formData) {
      const renewed = await headersWith(true)
      if (renewed.Authorization) {
        response = await send(url, { method, headers: renewed, payload, signal, timeoutMs })
      }
    }
  } catch (err) {
    // A caller-initiated abort is not an error worth wrapping.
    if (signal?.aborted) throw err
    const aborted = err?.name === 'AbortError'
    throw new ApiError(
      aborted ? `Request timed out after ${timeoutMs}ms` : 'Network error — could not reach the API',
      { status: 0, path: fullPath, cause: err },
    )
  }

  const parsed = await parseBody(response)

  if (!response.ok) {
    const error = new ApiError(messageFrom(parsed, response, fullPath), {
      status: response.status,
      path: fullPath,
      body: parsed,
    })
    // 401 means the session is dead. 403 means it is fine and this account
    // simply owns no business — a state the app renders, not a sign-out.
    if (error.status === 401 && auth) {
      clearSession()
      notifyAuthFailure(error)
    }
    throw error
  }

  return parsed
}

export const api = {
  get: (path, options) => request(path, { ...options, method: 'GET' }),
  post: (path, body, options) => request(path, { ...options, method: 'POST', body }),
  put: (path, body, options) => request(path, { ...options, method: 'PUT', body }),
  patch: (path, body, options) => request(path, { ...options, method: 'PATCH', body }),
  del: (path, options) => request(path, { ...options, method: 'DELETE' }),
  upload: (path, formData, options) => request(path, { ...options, method: 'POST', formData }),
}

export default api
