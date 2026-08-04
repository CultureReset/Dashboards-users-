import { GCR_API_BASE } from './config'

const GCR_API = `${GCR_API_BASE}/api/gcr`
const AUTH_API = `${GCR_API_BASE}/api/auth`
const BIZ_AUTH = `${GCR_API_BASE}/api/business-auth`

async function post(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const err = new Error(data.error || `Request failed (${res.status})`)
    Object.assign(err, data) // keeps claim_instead, hint, entity_slug
    throw err
  }
  return data
}

/* ── Signing up a brand-new business ───────────────────────────────────────
 *
 * Separate from tourist sign-up on GCR Unified, which is a different product
 * with a different account model. These call /api/business-auth/*.
 */

/** Text a six-digit code to a business phone number. */
export const sendSignupCode = (phone) => post(`${BIZ_AUTH}/phone`, { phone })

/** Check the code before asking for anything else. */
export const verifySignupCode = (phone, code) => post(`${BIZ_AUTH}/verify`, { phone, code })

/**
 * Listings that already look like this name. Read-only and public — used to
 * warn someone before they fill in a whole profile for a business that is
 * already on GCR, so they claim it instead of duplicating it.
 */
export async function findSimilarBusinesses(name) {
  const res = await fetch(`${BIZ_AUTH}/similar?name=${encodeURIComponent(name)}`)
  if (!res.ok) return []
  const data = await res.json().catch(() => ({}))
  return data.matches || []
}

/**
 * Create the account, the listing and the ownership row.
 *
 * No password anywhere: the response carries a one-time `session_secret` the
 * browser signs in with immediately. The business never sees it and never
 * needs it again — their phone number is the login.
 *
 * The listing is created hidden and stays that way until an admin approves it.
 * Throws with `claim_instead` attached when the business is already listed.
 */
export const registerBusiness = (payload) => post(`${BIZ_AUTH}/register`, payload)

/** Text a code to a number that already has a business. */
export const sendSigninCode = (phone) => post(`${BIZ_AUTH}/signin`, { phone })

/** Check it, and get the one-time secret to sign in with. */
export const verifySigninCode = (phone, code) => post(`${BIZ_AUTH}/signin-verify`, { phone, code })

/**
 * What an invite token is for — GET /api/auth/invite/:token.
 *
 * Read before showing the setup form so an expired or already-used link says
 * so instead of taking a password and failing on submit. Returns
 * { email, entity_slug, business_name }.
 */
export async function readInvite(token) {
  const res = await fetch(`${AUTH_API}/invite/${encodeURIComponent(token)}`)
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `That link could not be checked (${res.status}).`)
  return data
}

/**
 * Accept an invite — POST /api/auth/accept-invite.
 *
 * Creates the Supabase Auth account, the ownership row the dashboard reads
 * access from, and sets the industry if one was picked. The account exists
 * after this, so the caller can sign straight in with the invite's email and
 * the password just chosen.
 */
export async function acceptInvite({ token, password, entity_type }) {
  const res = await fetch(`${AUTH_API}/accept-invite`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, password, entity_type }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `Setup failed (${res.status}).`)
  return data
}

/**
 * Fetch one business by slug. Response is the flat entity object itself
 * (no wrapper) — hours/photos/tags/events/specials/reviews/faqs/policies/
 * sections/menu_sections/drink_sections/happy_hour_sections/industry_facts/
 * child_count/is_hub/parent all arrive as top-level keys.
 */
export async function fetchEntity(slug) {
  const res = await fetch(`${GCR_API}/entity/${encodeURIComponent(slug)}`)
  if (!res.ok) throw new Error(`Entity not found (${res.status})`)
  return res.json()
}

/**
 * Search businesses by name. Backs both the admin business picker and the
 * claim flow. GET /api/gcr/entities returns { entities, total, offset, limit }
 * and filters to is_active businesses. An empty query returns the first page.
 */
export async function searchEntities(query, { limit = 40 } = {}) {
  const params = new URLSearchParams({ limit: String(limit) })
  const q = (query || '').trim()
  if (q) params.set('search', q)

  const res = await fetch(`${GCR_API}/entities?${params}`)
  if (!res.ok) throw new Error(`Search failed (${res.status})`)
  const data = await res.json()
  return data.entities || []
}

/**
 * Submit a claim on a business — POST /api/gcr/claim writes a business_claims
 * row with status 'new'. Admin reviews it in cybercheck-login's admin.html GCR
 * Claims panel (GET /api/admin/gcr/claims, PATCH /api/admin/gcr/claims/:id);
 * approving is what creates the login and the entity_owners row that this
 * dashboard reads access from.
 *
 * The API requires business_name and phone; everything else is optional.
 */
export async function submitClaim(claim) {
  const res = await fetch(`${GCR_API}/claim`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(claim),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `Claim failed (${res.status})`)
  return data
}
