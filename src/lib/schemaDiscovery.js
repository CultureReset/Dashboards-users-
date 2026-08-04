import { api } from './apiClient'
import { endpoints } from './endpoints'

// Runtime schema discovery.
//
// The dashboard carries no list of known tables. It asks what tables exist and
// treats every table with an `entity_slug` column as a possible business
// section — so adding a table to the database makes it appear here, and
// dropping one makes it disappear, with no deploy in between.
//
// What changed: the question used to go straight to PostgREST's OpenAPI
// document with the anon key, which meant downloading the entire database
// schema into the browser on every load. It goes to GET /api/business/schema
// now. The API computes the same answer server-side with the service key and
// caches it, so the reply is a short list rather than the whole database — and
// tables the browser was never allowed to see are included, because the API is
// the one reading them.

const SCHEMA_CACHE_KEY = 'gcr_entity_tables_v1'

/** Last known table list, for instant first paint. May be stale or null. */
export function getCachedTables() {
  try {
    const raw = localStorage.getItem(SCHEMA_CACHE_KEY)
    if (!raw) return null
    const { tables } = JSON.parse(raw)
    return Array.isArray(tables) ? tables : null
  } catch {
    return null
  }
}

// Columns per table, so edit forms can build themselves from the schema
// rather than from hand-written field lists.
let columnsByTable = {}

/** Column definitions for a table: [{ name, type, format, editable }] */
export function getColumns(table) {
  return columnsByTable[table] || []
}

/**
 * Whether a business may hand-edit this column.
 *
 * The API decides — it strips the same identity and bookkeeping columns out of
 * every incoming body, so a form that offered one would just be showing a
 * field the server ignores. `editable` is its answer; the local test is the
 * fallback for a cached column list from before the API returned the flag.
 */
const SYSTEM_COLUMNS = new Set([
  'id',
  'entity_slug',
  'entity_id',
  'site_id',
  'created_at',
  'updated_at',
  'search_vector',
  'embedding',
])

export function isEditableColumn(col) {
  if (typeof col?.editable === 'boolean') return col.editable
  return !SYSTEM_COLUMNS.has(col.name) && !col.readOnly
}

/** Always reads the live schema. This is the source of truth. */
export async function fetchEntityTables() {
  const { tables = [], columns = {} } = await api.get(endpoints.business.schema())

  columnsByTable = columns

  try {
    localStorage.setItem(SCHEMA_CACHE_KEY, JSON.stringify({ tables, at: Date.now() }))
  } catch {
    /* storage unavailable — discovery still works, just without a warm start */
  }

  return tables
}
