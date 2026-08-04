import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { api, onAuthFailure } from './apiClient'
import { endpoints } from './endpoints'
import { getSession, setSession, clearSession, onSessionChange, setActingSlug } from './authStore'
import { LOGIN_DOMAIN } from './config'

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

  // The store is the one copy of the session; this mirrors it into React so
  // the tree re-renders when a sign-in, a renewal or a sign-out changes it.
  useEffect(() => onSessionChange(setSessionState), [])

  // The API rejecting our token is the only reliable sign a session has died.
  useEffect(() => onAuthFailure(() => setAccess(null)), [])

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
    loadAccess()
  }, [session, loadAccess])

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
    setAccess(null)
  }

  // An admin viewing a business wins over their own ownership row, so support
  // can jump straight into any dashboard.
  const isAdmin = !!access?.isAdmin
  const gcrSlug = (isAdmin && adminSlug) || access?.slug || null

  // Tell the API client which business to name on every call. Only an admin
  // has one to name: an owner's slug comes from entity_owners server-side and
  // this stays null for them.
  useEffect(() => {
    setActingSlug(isAdmin && adminSlug ? adminSlug : null)
  }, [isAdmin, adminSlug])

  const value = {
    session,
    user: session?.user || null,
    loading: !!session && access === undefined,
    gcrSlug,
    businessName: access?.name || null,
    role: access?.role || null,
    isAdmin,
    viewingAsAdmin: !!(isAdmin && adminSlug),
    hasAccess: !!gcrSlug,
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
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
