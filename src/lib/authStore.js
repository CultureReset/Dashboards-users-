// Where the session lives now that the Supabase client is gone.
//
// The Supabase browser client used to own all of this: it kept the tokens, it
// renewed them before they expired, and it told the app when they changed.
// Removing it from the bundle means the three jobs move here.
//
// What is stored is the same thing it stored — an access token and a refresh
// token issued by Supabase Auth, minted server-side by gcr-api-clean. The
// difference is that nothing here can talk to the database; a token is only
// ever handed to the API, which decides what it is worth.

import { GCR_API_BASE } from './config'

const STORAGE_KEY = 'gcr_business_session_v1'

/** Renew this long before the token actually expires, so a call never races it. */
const REFRESH_MARGIN_S = 60

let session = read()
const listeners = new Set()

function read() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return parsed?.access_token ? parsed : null
  } catch {
    return null
  }
}

function write(next) {
  session = next || null
  try {
    if (session) localStorage.setItem(STORAGE_KEY, JSON.stringify(session))
    else localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* private browsing — the session just won't survive a reload */
  }
  for (const listener of listeners) {
    try {
      listener(session)
    } catch {
      // A misbehaving listener must not break sign-in.
    }
  }
}

/** The current session, or null. Synchronous — may be expired; see getToken. */
export function getSession() {
  return session
}

/* ── the business an admin is looking at ──────────────────────────────────
 *
 * A normal owner never sets this: the API resolves their business from
 * entity_owners and ignores anything the request says.
 *
 * An admin has no ownership row, so there is nothing for the server to
 * resolve. middleware/ownerAuth.js allows exactly one exception — an account
 * platform_admins vouches for may name a slug explicitly — and this is where
 * that slug lives so every request can carry it, not just the ones that
 * happened to take it as an argument.
 *
 * Naming it here changes no permission. The server still checks
 * platform_admins before honouring it; for anyone else it is ignored outright.
 */
let actingSlug = null

export function setActingSlug(slug) {
  actingSlug = slug || null
}

export function getActingSlug() {
  return actingSlug
}

export function setSession(next) {
  write(next)
}

export function clearSession() {
  write(null)
}

/** Called whenever the session appears, changes or goes away. */
export function onSessionChange(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function expiresSoon(current) {
  if (!current?.expires_at) return false
  return current.expires_at - REFRESH_MARGIN_S <= Math.floor(Date.now() / 1000)
}

// One refresh at a time. Several requests waking up to an expired token must
// not each spend the refresh token — the second one would be using a token the
// first has already rotated away.
let refreshing = null

async function refresh() {
  if (!session?.refresh_token) return null
  if (!refreshing) {
    refreshing = fetch(`${GCR_API_BASE}/api/business-auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: session.refresh_token }),
    })
      .then(async (res) => {
        if (!res.ok) {
          // The refresh token is spent or revoked. Signed out is the truth.
          clearSession()
          return null
        }
        const data = await res.json().catch(() => ({}))
        if (!data?.session?.access_token) {
          clearSession()
          return null
        }
        write(data.session)
        return data.session
      })
      .catch(() => {
        // A network failure is not proof the session is invalid — keep it and
        // let the next call try again rather than signing the owner out.
        return null
      })
      .finally(() => {
        refreshing = null
      })
  }
  return refreshing
}

/**
 * A usable access token, renewed first if it is about to expire.
 *
 * Returns null when there is no session, or when the refresh failed and the
 * old token is genuinely dead.
 */
export async function getToken() {
  if (!session) return null
  if (!expiresSoon(session)) return session.access_token
  const renewed = await refresh()
  return renewed?.access_token || session?.access_token || null
}

/** Force a renewal after the API rejects a token we believed was still good. */
export async function refreshNow() {
  return refresh()
}
