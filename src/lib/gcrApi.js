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
 * with a different account model. Self-serve signup uses /api/auth/business-signup
 * (email + password). Phone OTP helpers were removed from this client; the API
 * phone routes remain in gcr-api-clean for older clients.
 */

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
 * Create the Auth account, the listing and the ownership row.
 *
 * POST /api/auth/business-signup — email + password + business_name.
 * Does not return a session; the caller signs in with the same credentials
 * via POST /api/business-auth/password (same pattern as AcceptInvite).
 *
 * The listing is created hidden and stays that way until an admin approves it.
 */
export const businessSignup = (payload) =>
  call(() => api.post(endpoints.auth.businessSignup(), payload, PUBLIC))

/** Ask Supabase Auth to email a recovery link to the dashboard reset page. */
export const forgotPassword = (email) =>
  call(() => api.post(endpoints.auth.forgotPassword(), { email }, PUBLIC))

/**
 * Set a new password using the recovery access_token from the email link hash.
 * The API verifies the token with Auth, then updates the password server-side.
 */
export const resetPassword = ({ access_token, password }) =>
  call(() => api.post(endpoints.auth.resetPassword(), { access_token, password }, PUBLIC))

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
