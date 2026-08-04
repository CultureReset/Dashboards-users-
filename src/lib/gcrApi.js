import { GCR_API_BASE } from './config'

const GCR_API = `${GCR_API_BASE}/api/gcr`
const AUTH_API = `${GCR_API_BASE}/api/auth`

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
