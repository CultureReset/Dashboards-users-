import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react'
import { api, onAuthFailure } from './apiClient'
import { endpoints } from './endpoints'
import { getSession, setSession, clearSession, onSessionChange, setActingSlug } from './authStore'
import { GCR_API_BASE, LOGIN_DOMAIN } from './config'

const AuthContext = createContext(null)

// Sign-in, and who the signed-in account is allowed to be.
//
// Both halves used to happen in the browser against Supabase directly: the
// Supabase client held the session, and this file read entity_owners and
// platform_admins itself to work out access. Those two reads are now one call
// to GET /api/business/me, and the session is minted by the API rather than
// redeemed here — which is what let the database client leave the bundle.
//
// The access answer was already trustworthy before; it was computed from
// tables the browser could not forge. What changed is that the browser no
// longer needs a database key to ask the question.

export { LOGIN_DOMAIN }

/** Businesses sign in with their slug; Supabase Auth files them under an email. */
const toLoginIdentifier = (identifier) => String(identifier || '').trim()

/** Admins can open any business by slug: ?business=<slug> */
function slugFromUrl() {
  return new URLSearchParams(location.search).get('business')
}

function passFromUrl() {
  return new URLSearchParams(location.search).get('pass')
}

function stripPassFromUrl() {
  const url = new URL(location.href)
  if (!url.searchParams.has('pass')) return
  url.searchParams.delete('pass')
  history.replaceState({}, '', url)
}

/** Human copy for exchange-impersonation HTTP failures. */
function impersonationErrorMessage(status) {
  if (status === 400) return 'This admin link is incomplete.'
  if (status === 401) return 'This admin link expired. Ask an admin to open the dashboard again.'
  if (status === 409) return 'This admin link was already used.'
  if (status === 501) return 'Not available yet — admin Open dashboard is not fully set up.'
  return 'Could not open this business as admin. Ask an admin to try again.'
}

/**
 * Supabase's `{ data, error }` shape, kept.
 *
 * Every caller in this app already reads `{ error }` back from these and
 * decides what to render. Preserving the shape keeps the sign-in pages out of
 * this change entirely.
 */
async function attempt(work) {
  try {
    return { data: await work(), error: null }
  } catch (error) {
    return { data: null, error }
  }
}

export function AuthProvider({ children }) {
  const [session, setSessionState] = useState(() => getSession() ?? null)
  const [access, setAccess] = useState(undefined)
  const [adminSlug, setAdminSlug] = useState(slugFromUrl())
  const [ownerSlug, setOwnerSlug] = useState(null)
  const [impersonationBooting, setImpersonationBooting] = useState(() => !!passFromUrl())
  const [impersonationError, setImpersonationError] = useState(null)

  // Guard so React Strict Mode (and a remount) cannot spend the one-time pass twice.
  const passExchangeRef = useRef(null)

  // The store is the one copy of the session; this mirrors it into React so
  // the tree re-renders when a sign-in, a renewal or a sign-out changes it.
  useEffect(() => onSessionChange(setSessionState), [])

  // The API rejecting our token is the only reliable sign a session has died.
  useEffect(() => onAuthFailure(() => setAccess(null)), [])

  /**
   * Admin "Open dashboard" deep link: ?pass=…&business=<slug>
   *
   * Exchange exactly once, store the session (no refresh_token), scope to the
   * slug, strip pass from the URL. Prefer the pass over any prior owner session.
   */
  useEffect(() => {
    const pass = passFromUrl()
    if (!pass) {
      setImpersonationBooting(false)
      return
    }

    if (passExchangeRef.current === pass) return
    passExchangeRef.current = pass

    let cancelled = false
    setImpersonationBooting(true)
    setImpersonationError(null)

    ;(async () => {
      try {
        const res = await fetch(`${GCR_API_BASE}${endpoints.auth.exchangeImpersonation()}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ pass }),
        })
        const data = await res.json().catch(() => ({}))
        if (cancelled) return
        if (!res.ok) {
          clearSession()
          setActingSlug(null)
          setAccess(null)
          setImpersonationError(impersonationErrorMessage(res.status))
          stripPassFromUrl()
          return
        }
        const minted = data?.session
        if (!minted?.access_token) {
          clearSession()
          setActingSlug(null)
          setAccess(null)
          setImpersonationError(impersonationErrorMessage(500))
          stripPassFromUrl()
          return
        }
        const slug = data.slug || minted.slug || slugFromUrl()
        setSession(minted)
        if (slug) {
          setActingSlug(slug)
          setAdminSlug(slug)
          const url = new URL(location.href)
          url.searchParams.set('business', slug)
          url.searchParams.delete('pass')
          history.replaceState({}, '', url)
        } else {
          stripPassFromUrl()
        }
      } catch {
        if (cancelled) return
        clearSession()
        setActingSlug(null)
        setAccess(null)
        setImpersonationError(impersonationErrorMessage(500))
        stripPassFromUrl()
      } finally {
        if (!cancelled) setImpersonationBooting(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [])

  /**
   * What this account owns. One call, answered server-side.
   *
   * A 403 is not a failure here — it is the honest answer for an account with
   * no row in entity_owners, and the app has a screen for it.
   */
  const loadAccess = useCallback(async () => {
    if (!getSession()) {
      setAccess(null)
      return
    }
    try {
      setAccess(await api.get(endpoints.auth.me()))
    } catch (error) {
      setAccess(error?.isNotLinked ? { slug: null, isAdmin: false, hasAccess: false } : null)
    }
  }, [])

  useEffect(() => {
    if (session === undefined) return
    if (impersonationBooting) return
    loadAccess()
  }, [session, loadAccess, impersonationBooting])

  /* ── the three ways in ────────────────────────────────────────────────── */

  /** Slug or email plus a password — the invite accounts. */
  const signIn = (identifier, password) =>
    attempt(async () => {
      const { session: minted } = await api.post(
        endpoints.auth.password(),
        { identifier: toLoginIdentifier(identifier), password },
        { auth: false },
      )
      setSession(minted)
      return minted
    })

  /**
   * Businesses that signed up by phone.
   *
   * The code check already returned a finished session, so there is nothing
   * left to redeem — this just stores it. The two trailing arguments are the
   * old one-time secret and login address; they are accepted and ignored so
   * the sign-in pages did not have to change in the same commit.
   */
  const signInWithPhone = (phone, secretOrSession) =>
    attempt(async () => {
      const minted = secretOrSession?.access_token ? secretOrSession : null
      if (!minted) {
        throw new Error('That sign-in did not complete — request a new code.')
      }
      setSession(minted)
      return minted
    })

  /** Store a session the API already minted (sign-up, or a code check). */
  const adoptSession = (minted) => {
    if (minted?.access_token) setSession(minted)
    return minted
  }

  const signOut = async () => {
    // Tell the API first, while the token is still attached, so the refresh
    // token is revoked rather than merely forgotten.
    try {
      await api.post(endpoints.auth.signout(), {})
    } catch {
      /* signing out locally is what matters; the token expires on its own */
    }
    clearSession()
    setActingSlug(null)
    setAdminSlug(null)
    setAccess(null)
    setImpersonationError(null)
  }

  /** Exit an admin impersonation session back to the normal login screen. */
  const exitImpersonation = async () => {
    await signOut()
    const url = new URL(location.href)
    url.searchParams.delete('pass')
    url.searchParams.delete('business')
    history.replaceState({}, '', url)
  }

  // An admin viewing a business wins over their own ownership row, so support
  // can jump straight into any dashboard.
  const isAdmin = !!access?.isAdmin || !!session?.admin_impersonation
  const ownedSlugs = access?.slugs || (access?.slug ? [{ slug: access.slug, name: access.name, role: access.role }] : [])
  const ownedChildren = access?.children || []

  // Keep ownerSlug among the owned set when /me refreshes.
  const effectiveOwnerSlug =
    (ownerSlug && ownedSlugs.some((s) => s.slug === ownerSlug) && ownerSlug) ||
    ownedSlugs[0]?.slug ||
    access?.slug ||
    null

  const impersonationSlug = session?.admin_impersonation
    ? (session.slug || adminSlug || access?.slug || null)
    : null

  const gcrSlug = impersonationSlug || (isAdmin && adminSlug) || effectiveOwnerSlug || null

  // Admins name a business explicitly. Owners with multiple linked units also
  // name the active one so /api/business/* scopes to that slug.
  // Impersonation sessions are locked to one slug in the JWT; still set acting
  // slug so client requests stay consistent with today's ?business= behaviour.
  useEffect(() => {
    if (session?.admin_impersonation && (session.slug || adminSlug)) {
      setActingSlug(session.slug || adminSlug)
    } else if (isAdmin && adminSlug) {
      setActingSlug(adminSlug)
    } else if (!isAdmin && effectiveOwnerSlug && ownedSlugs.length > 1) {
      setActingSlug(effectiveOwnerSlug)
    } else {
      setActingSlug(null)
    }
  }, [isAdmin, adminSlug, effectiveOwnerSlug, ownedSlugs.length, session])

  const viewingAsImpersonation = !!session?.admin_impersonation

  const value = {
    session,
    user: session?.user || null,
    loading: impersonationBooting || (!!session && access === undefined),
    gcrSlug,
    businessName:
      (ownedSlugs.find((s) => s.slug === gcrSlug)?.name) ||
      access?.name ||
      null,
    role: (ownedSlugs.find((s) => s.slug === gcrSlug)?.role) || access?.role || null,
    isAdmin,
    viewingAsAdmin: !!(isAdmin && adminSlug) || viewingAsImpersonation,
    viewingAsImpersonation,
    impersonationError,
    hasAccess: !!gcrSlug,
    ownedSlugs,
    ownedChildren,
    selectOwnerSlug: (slug) => setOwnerSlug(slug || null),
    refreshAccess: loadAccess,
    openBusiness: (slug) => {
      setAdminSlug(slug)
      const url = new URL(location.href)
      url.searchParams.set('business', slug)
      history.pushState({}, '', url)
    },
    closeBusiness: () => {
      setAdminSlug(null)
      const url = new URL(location.href)
      url.searchParams.delete('business')
      history.pushState({}, '', url)
    },
    signIn,
    signInWithPhone,
    adoptSession,
    signOut,
    exitImpersonation,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
