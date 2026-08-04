import { api } from './apiClient'
import { endpoints } from './endpoints'

// Every section this business has, in one request.
//
// This used to be the most expensive thing the dashboard did: 316 separate
// PostgREST calls from the browser, twelve at a time, on every page load — one
// per slug-scoped table — plus an RPC fallback and a concurrency pool to
// manage them. All of that moved to the server. GET /api/business/sections
// runs the same sweep next to the database with the service key and returns
// only the tables that actually have rows.
//
// Two things got better besides the round trips. The API resolves the business
// from the session, so the slug is no longer something the browser asserts.
// And the 99 slug tables with row-level security on and no policy — which
// returned an empty list to the browser, indistinguishable from "this business
// has nothing here" — come back with their real contents now.

const CACHE_PREFIX = 'gcr_tables_'
const CACHE_TTL_MS = 1000 * 60 * 5

export function readTableCache(slug) {
  try {
    const raw = sessionStorage.getItem(CACHE_PREFIX + slug)
    if (!raw) return null
    const { rows, at } = JSON.parse(raw)
    if (Date.now() - at > CACHE_TTL_MS) return null
    return rows
  } catch {
    return null
  }
}

function writeTableCache(slug, rows) {
  try {
    sessionStorage.setItem(CACHE_PREFIX + slug, JSON.stringify({ rows, at: Date.now() }))
  } catch {
    /* quota exceeded — caching is optional */
  }
}

/**
 * @param {string} slug   Which business the caller believes it is showing. The
 *                        server resolves this from the session regardless; it
 *                        is used here only to key the cache. Admins viewing
 *                        another business pass it through as `?slug=`.
 * @param {string[]} tables    Kept for the progress callback's denominator.
 * @param {{ onFound?: (table: string, rows: object[]) => void,
 *           onProgress?: (done: number, total: number) => void }} handlers
 * @returns {Promise<Record<string, object[]>>}
 */
export async function fetchTablesForSlug(slug, tables = [], { onFound, onProgress } = {}) {
  const { sections = {} } = await api.get(endpoints.business.sections(), {
    // Only honoured for an account platform_admins vouches for; for everyone
    // else the server uses the session's own slug and ignores this entirely.
    query: { slug },
  })

  for (const [table, rows] of Object.entries(sections)) onFound?.(table, rows)

  // One call, so there is no partial progress to report — it is done or it
  // threw. The callback stays because the caller draws a progress bar with it.
  onProgress?.(tables.length, tables.length)

  writeTableCache(slug, sections)
  return sections
}
