/**
 * Owner modules API — matches gcr-api-clean PR #80
 * (branch feat/entity-modules-store-admin → routes/owner-modules.js).
 *
 *   GET /api/owner/modules
 *     Auth: ownerRequired (Bearer session; same headers apiClient already sends)
 *     Business: from entity_owners via the session — never send entity_id / slug
 *     Body: { modules: [{ key, enabled, has_data? }] }
 *     Keys are already canonical (gallery→photos, menu→menu_sections on the API).
 *     Extra fields (e.g. has_data) are ignored; a shorter list is fine — nav
 *     unions whatever modules the API returns with discovery.
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
 * @returns {Promise<{ available: boolean, modules: ReturnType<typeof normalizeModulesList>, raw: any, error?: any }>}
 */
export async function fetchOwnerModules() {
  try {
    const raw = await api.get(endpoints.modules.list())
    applyCatalogFromApi(raw)
    return {
      available: true,
      modules: normalizeModulesList(raw),
      raw,
    }
  } catch (error) {
    clearCatalogFromApi()
    if (isUnavailable(error)) {
      return { available: false, modules: [], raw: null }
    }
    // Auth / network: keep discovery nav; Dashboard soft-fails.
    return { available: false, modules: [], raw: null, error }
  }
}
