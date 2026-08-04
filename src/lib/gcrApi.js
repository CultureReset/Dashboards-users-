import { api, ApiError } from './apiClient'
import { endpoints } from './endpoints'

/* Sign-up, sign-in and the public listing reads.
 *
 * These are the calls that happen before there is a session, so they pass
 * `auth: false` — there is no token to attach yet, and sending an expired one
 * from a previous visit would only confuse the answer.
 *
 * Everything here already went through gcr-api-clean. What changed is that it
 * goes through apiClient.js now instead of its own fetch wrapper, so timeouts,
 * error shapes and JSON handling match the rest of the app.
 */

const PUBLIC = { auth: false }

/**
 * The API attaches extra fields to some errors — `claim_instead`, `hint`,
 * `entity_slug` — that the sign-up screens render. ApiError keeps the parsed
 * body, so copy them onto the error the caller catches.
 */
function withDetail(error) {
  if (error instanceof ApiError && error.body && typeof error.body === 'object') {
    Object.assign(error, error.body)
    error.message = error.body.error || error.message
  }
  return error
}

const call = async (work) => {
  try {
    return await work()
  } catch (error) {
    throw withDetail(error)
  }
}

/* ── Signing up a brand-new business ───────────────────────────────────────
 *
 * Separate from tourist sign-up on GCR Unified, which is a different product
 * with a different account model. These call /api/business-auth/*.
 */

/** Text a six-digit code to a business phone number. */
export const sendSignupCode = (phone) =>
  call(() => api.post(endpoints.auth.signupCode(), { phone }, PUBLIC))

/** Check the code before asking for anything else. */
export const verifySignupCode = (phone, code) =>
  call(() => api.post(endpoints.auth.verifySignupCode(), { phone, code }, PUBLIC))

/**
 * Listings that already look like this name. Read-only and public — used to
 * warn someone before they fill in a whole profile for a business that is
 * already on GCR, so they claim it instead of duplicating it.
 */
export async function findSimilarBusinesses(name) {
  try {
    const data = await api.get(endpoints.auth.similar(), { ...PUBLIC, query: { name } })
    return data?.matches || []
  } catch {
    // A warning that fails to load must not block a sign-up.
    return []
  }
}

/**
 * Create the account, the listing and the ownership row.
 *
 * No password anywhere. The response carries the finished `session` — the API
 * mints it server-side from a one-time secret that never leaves that process.
 * The business's phone number is the login.
 *
 * The listing is created hidden and stays that way until an admin approves it.
 * Throws with `claim_instead` attached when the business is already listed.
 */
export const registerBusiness = (payload) =>
  call(() => api.post(endpoints.auth.register(), payload, PUBLIC))

/** Text a code to a number that already has a business. */
export const sendSigninCode = (phone) =>
  call(() => api.post(endpoints.auth.signinCode(), { phone }, PUBLIC))

/** Check it, and get the session to sign in with. */
export const verifySigninCode = (phone, code) =>
  call(() => api.post(endpoints.auth.verifySigninCode(), { phone, code }, PUBLIC))

/**
 * What an invite token is for — GET /api/auth/invite/:token.
 *
 * Read before showing the setup form so an expired or already-used link says
 * so instead of taking a password and failing on submit. Returns
 * { email, entity_slug, business_name }.
 */
export const readInvite = (token) =>
  call(() => api.get(endpoints.auth.invite(token), PUBLIC))

/**
 * Accept an invite — POST /api/auth/accept-invite.
 *
 * Creates the Supabase Auth account, the ownership row the dashboard reads
 * access from, and sets the industry if one was picked. The account exists
 * after this, so the caller can sign straight in with the invite's email and
 * the password just chosen.
 */
export const acceptInvite = ({ token, password, entity_type }) =>
  call(() => api.post(endpoints.auth.acceptInvite(), { token, password, entity_type }, PUBLIC))

/**
 * Fetch one business by slug. Response is the flat entity object itself
 * (no wrapper) — hours/photos/tags/events/specials/reviews/faqs/policies/
 * sections/menu_sections/drink_sections/happy_hour_sections/industry_facts/
 * child_count/is_hub/parent all arrive as top-level keys.
 */
export const fetchEntity = (slug) =>
  call(() => api.get(endpoints.gcr.entity(slug), PUBLIC))

/**
 * Search businesses by name. Backs both the admin business picker and the
 * claim flow. GET /api/gcr/entities returns { entities, total, offset, limit }
 * and filters to is_active businesses. An empty query returns the first page.
 */
export async function searchEntities(query, { limit = 40 } = {}) {
  const data = await call(() =>
    api.get(endpoints.gcr.entities(), { ...PUBLIC, query: { limit, search: (query || '').trim() } }),
  )
  return data?.entities || []
}

/**
 * Submit a claim on a business — POST /api/gcr/claim writes a business_claims
 * row with status 'new'. An admin reviews it; approving is what creates the
 * login and the entity_owners row that this dashboard reads access from.
 *
 * The API requires business_name and phone; everything else is optional.
 */
export const submitClaim = (claim) =>
  call(() => api.post(endpoints.gcr.claim(), claim, PUBLIC))
