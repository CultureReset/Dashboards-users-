/**
 * Owner modules API — matches gcr-api-clean PR #80
 * (branch feat/entity-modules-store-admin → routes/owner-modules.js).
 *
 *   GET /api/owner/modules
 *     Auth: ownerRequired (Bearer session; same headers apiClient already sends)
 *     Business: from entity_owners via the session — never send entity_id / slug
 *     Body: {
 *       modules: [{ key, enabled, has_data, installed? }],
 *       owner_visible_tables?: string[],  // gcr-api-clean owner_visible filter
 *     }
 *     Keys are already canonical (gallery→photos, menu→menu_sections on the API).
 *     has_data + installed: installed apps with no rows still get a nav tab
 *     (empty state). Uninstalled empty modules stay hidden.
 *     owner_visible_tables filters schema-discovery tabs (no hardcoded business list).
 *
 * There is NO owner POST. Toggle / install is Store + admin only:
 *   POST/DELETE /api/store/:itemId… for kind:'module' projects onto entity_modules.
 * After Store mutations, refetch this GET to refresh nav.
 *
 * Soft fallback: 404/405/501 → { available: false } so discovery-only nav still works
 * until PR #80 is deployed.
 */

import { api, ApiError } from './apiClient'
import { endpoints } from './endpoints'
import {
  applyCatalogFromApi,
  clearCatalogFromApi,
  normalizeModulesList,
} from './moduleNav'

function isUnavailable(error) {
  if (!(error instanceof ApiError)) return false
  return error.isMissingEndpoint || error.status === 501 || error.status === 502
}

/**
 * @returns {Promise<{ available: boolean, modules: ReturnType<typeof normalizeModulesList>, ownerVisibleTables: string[]|null, raw: any, error?: any }>}
 */
export async function fetchOwnerModules() {
  try {
    const raw = await api.get(endpoints.modules.list())
    applyCatalogFromApi(raw)
    const tables = Array.isArray(raw?.owner_visible_tables)
      ? raw.owner_visible_tables.map((t) => String(t || '').trim()).filter(Boolean)
      : null
    return {
      available: true,
      modules: normalizeModulesList(raw),
      ownerVisibleTables: tables,
      raw,
    }
  } catch (error) {
    clearCatalogFromApi()
    if (isUnavailable(error)) {
      return { available: false, modules: [], ownerVisibleTables: null, raw: null }
    }
    // Auth / network: keep discovery nav; Dashboard soft-fails.
    return { available: false, modules: [], ownerVisibleTables: null, raw: null, error }
  }
}
