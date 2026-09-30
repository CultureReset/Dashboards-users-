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

// ---------------------------------------------------------------------------
// The copy on this device.
//
// This was sessionStorage with a five-minute TTL, which is a paint-fast cache
// and nothing more. Three things made it the wrong store once the data lives
// on a box at the end of a domestic connection rather than in a cloud API:
//
//   sessionStorage is cleared when the tab closes. Come back tomorrow and
//   there is nothing — the opposite of "cached at login".
//
//   The TTL treated a five-minute-old copy as absent, so a box that was
//   unreachable meant a blank dashboard instead of yesterday's data.
//
//   ~5MB, and it fails by THROWING mid-write. A business with a real menu and
//   a year of events goes past that, and the old code swallowed the error with
//   "caching is optional" — so it silently stopped caching at exactly the size
//   where caching started to matter.
//
// IndexedDB: async, room to spare, survives the tab closing. No TTL — a copy
// is never treated as absent, only as old. Freshness is the revalidate's job,
// which Dashboard.jsx already does by streaming rows in over the top.
//
// The exported functions keep their shapes. readTableCache stays synchronous
// for its one caller, which paints from whatever primeTableCache last left in
// memory; the write goes to IndexedDB in the background.
// ---------------------------------------------------------------------------

const DB_NAME = 'gcr-cache'
const STORE = 'sections'
const LEGACY_PREFIX = 'gcr_tables_'

/** What readTableCache can answer from without awaiting. Filled by primeTableCache. */
const memory = new Map()

let dbPromise = null
function openDb() {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(new Error('no indexedDB'))
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  return dbPromise
}

/**
 * Load this business's copy into memory. Call once, before the dashboard
 * paints — AuthContext after a successful sign-in is the right place.
 *
 * Resolves to the rows, or null. Never throws: a cache that can break the app
 * is worse than no cache.
 */
export async function primeTableCache(slug) {
  if (!slug) return null
  try {
    const db = await openDb()
    const row = await new Promise((resolve, reject) => {
      const t = db.transaction(STORE, 'readonly')
      const r = t.objectStore(STORE).get(slug)
      r.onsuccess = () => resolve(r.result)
      r.onerror = () => reject(r.error)
    })
    if (row?.rows) {
      memory.set(slug, { rows: row.rows, at: row.at })
      return row.rows
    }
  } catch { /* fall through to the old store */ }

  // One-time migration: anything sessionStorage still holds from before.
  try {
    const raw = sessionStorage.getItem(LEGACY_PREFIX + slug)
    if (raw) {
      const { rows } = JSON.parse(raw)
      if (rows) {
        memory.set(slug, { rows, at: Date.now() })
        writeTableCache(slug, rows)
        sessionStorage.removeItem(LEGACY_PREFIX + slug)
        return rows
      }
    }
  } catch { /* nothing to migrate */ }

  return null
}

/** The copy, if this device has one. No TTL — old is not the same as absent. */
export function readTableCache(slug) {
  return memory.get(slug)?.rows ?? null
}

/** How old that copy is, in ms, for telling the owner what they're looking at. */
export function tableCacheAge(slug) {
  const at = memory.get(slug)?.at
  return at ? Date.now() - at : null
}

function writeTableCache(slug, rows) {
  memory.set(slug, { rows, at: Date.now() })
  openDb()
    .then((db) => {
      const t = db.transaction(STORE, 'readwrite')
      t.objectStore(STORE).put({ rows, at: Date.now() }, slug)
    })
    .catch(() => { /* private window, or storage denied. Memory copy still works. */ })
}

/** On sign-out, and on switching business. */
export async function clearTableCache(slug) {
  memory.delete(slug)
  try {
    const db = await openDb()
    const t = db.transaction(STORE, 'readwrite')
    t.objectStore(STORE).delete(slug)
  } catch { /* nothing to clear */ }
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
