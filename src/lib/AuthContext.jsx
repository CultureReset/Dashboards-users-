import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { supabase } from './supabaseClient'
import { LOGIN_DOMAIN } from './config'

const AuthContext = createContext(null)

// Businesses sign in with their slug. Supabase Auth is email-based, so the slug
// maps to a derived login address — the same one the provisioning script uses.
// No real email is required to start; one can be added later.
export { LOGIN_DOMAIN }
const toLoginEmail = (identifier) =>
  identifier.includes('@')
    ? identifier.trim()
    : `${identifier.trim().toLowerCase()}@${LOGIN_DOMAIN}`

/** Must match loginEmailFor() in gcr-api-clean's routes/business-auth.js. */
const PHONE_LOGIN_DOMAIN =
  import.meta.env?.VITE_PHONE_LOGIN_DOMAIN || 'phone.biz.gulfcoastradar.com'

const toPhoneLoginEmail = (raw) => {
  const digits = String(raw || '').replace(/\D/g, '')
  const e164 = digits.length === 10 ? `1${digits}` : digits
  return `${e164}@${PHONE_LOGIN_DOMAIN}`
}

/** Admins can open any business by slug: ?business=<slug> */
function slugFromUrl() {
  return new URLSearchParams(location.search).get('business')
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(undefined)
  const [ownership, setOwnership] = useState(undefined)
  const [isAdmin, setIsAdmin] = useState(false)
  const [adminSlug, setAdminSlug] = useState(slugFromUrl())

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: listener } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => listener.subscription.unsubscribe()
  }, [])

  // Both checks are server-side. Ownership comes from entity_owners and admin
  // status from platform_admins — neither can be forged from the browser, which
  // is what keeps one account out of another business's data.
  const loadAccess = useCallback(async (userId) => {
    if (!userId) {
      setOwnership(null)
      setIsAdmin(false)
      return
    }

    const [{ data: owned }, { data: admin }] = await Promise.all([
      supabase.from('entity_owners').select('entity_slug, role').eq('user_id', userId).limit(1),
      supabase.from('platform_admins').select('user_id').eq('user_id', userId).limit(1),
    ])

    setOwnership(owned?.[0] || null)
    setIsAdmin(!!admin?.length)
  }, [])

  useEffect(() => {
    if (session === undefined) return
    loadAccess(session?.user?.id)
  }, [session, loadAccess])

  const signIn = (identifier, password) =>
    supabase.auth.signInWithPassword({ email: toLoginEmail(identifier), password })

  // Businesses that signed themselves up by phone.
  //
  // The account is an EMAIL account under a derived address, not a Supabase
  // phone account — phone accounts need the phone provider switched on in the
  // project, and it is not. Twilio Verify is what proved the number; Supabase
  // only stores the account. The API returns the address to use, so the
  // derivation lives in one place; the fallback matches it for safety.
  const signInWithPhone = (phone, secret, loginEmail) =>
    supabase.auth.signInWithPassword({
      email: loginEmail || toPhoneLoginEmail(phone),
      password: secret,
    })

  const signOut = () => supabase.auth.signOut()

  // An admin viewing a business wins over their own ownership row, so support
  // can jump straight into any dashboard.
  const gcrSlug = (isAdmin && adminSlug) || ownership?.entity_slug || null

  const value = {
    session,
    user: session?.user || null,
    loading: session === undefined || ownership === undefined,
    gcrSlug,
    isAdmin,
    viewingAsAdmin: !!(isAdmin && adminSlug),
    hasAccess: !!gcrSlug,
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
    signOut,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
