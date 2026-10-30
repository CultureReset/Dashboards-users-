/**
 * Owner modules API — thin adapter around whatever gcr-api-clean exposes.
 *
 * ASSUMPTION (2026-10-30): Concierge is adding an owner modules endpoint.
 * No matching open PR/branch was found on CultureReset/gcr-api-clean at
 * draft time, so this client targets:
 *
 *   GET  /api/owner/modules?entity_id=<id>  → { modules: [{ key, enabled }], catalog? }
 *   POST /api/owner/modules  { entity_id, key, enabled }
 *
 * Session owner auth (Bearer), same as /api/store. Paths live only in
 * endpoints.js so swapping to e.g. /api/business/modules is one edit.
 *
 * If the endpoint 404s / 405s / 501s, callers get { available: false } and
 * the dashboard falls back to pure data-discovery nav.
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
 * @param {{ entityId?: string|number|null, slug?: string|null }} opts
 * @returns {Promise<{ available: boolean, modules: ReturnType<typeof normalizeModulesList>, raw: any }>}
 */
export async function fetchOwnerModules({ entityId = null, slug = null } = {}) {
  try {
    const query = {}
    if (entityId != null && entityId !== '') query.entity_id = entityId
    if (slug) query.slug = slug
    const raw = await api.get(endpoints.modules.list(), { query })
    applyCatalogFromApi(raw)
    return {
      available: true,
      modules: normalizeModulesList(raw),
      raw,
    }
  } catch (error) {
    if (isUnavailable(error)) {
      clearCatalogFromApi()
      return { available: false, modules: [], raw: null }
    }
    // Auth / network errors: surface as unavailable for nav (keep discovery),
    // but rethrow only if the caller wants — for Dashboard we soft-fail.
    clearCatalogFromApi()
    return { available: false, modules: [], raw: null, error }
  }
}

/**
 * Enable/disable one module for this business.
 * Soft-fails the same way when the endpoint is not deployed yet.
 */
export async function setOwnerModuleEnabled({ entityId, key, enabled, slug = null }) {
  try {
    const body = { key, enabled: !!enabled }
    if (entityId != null && entityId !== '') body.entity_id = entityId
    if (slug) body.slug = slug
    const raw = await api.post(endpoints.modules.set(), body)
    return { available: true, raw }
  } catch (error) {
    if (isUnavailable(error)) return { available: false, raw: null }
    throw error
  }
}
