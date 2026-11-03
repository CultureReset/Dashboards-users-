// Every call the SDK renderer makes. Nothing here builds a URL (endpoints.sdkApps
// does) or calls fetch (apiClient does), and nothing here names a business: the
// API resolves it from the session, or — for an admin "viewing as" — from the
// acting slug apiClient attaches to owner-scoped paths (lib/actingScope.js).
//
// Response shapes are the ones docs/APP-SDK.md "Owner dashboard contract"
// defines in gcr-api-clean (branch feat/app-sdk); docs/SDK-RENDERER.md marks
// each as confirmed-from-code or assumed.

import { api } from '../lib/apiClient'
import endpoints from '../lib/endpoints'
import { GCR_API_BASE } from '../lib/config'

export { GCR_API_BASE }

/** GET /api/apps -> { apps: [{ id, name, summary, icon, version, hasSettings, resources[] }] } */
export const listSdkApps = (options) => api.get(endpoints.sdkApps.list(), options)

/** GET /api/apps/<id> -> the descriptor (app, installed, permissions, settings, resources, actions, events, surfaces, public) */
export const getSdkApp = (id, options) => api.get(endpoints.sdkApps.app(id), options)

/** PATCH /api/apps/<id>/settings { settings: { changed keys } } -> { settings } */
export const saveSdkSettings = (id, settings) => api.patch(endpoints.sdkApps.settings(id), { settings })

/** GET .../resources/<resource>?limit&offset -> { resource, rows, total, limit, offset } */
export const listSdkRows = (id, resource, { limit = 50, offset = 0 } = {}, options) =>
  api.get(endpoints.sdkApps.rows(id, resource), { ...options, query: { limit, offset } })

/** POST .../resources/<resource> { fields } -> 201 { resource, row } */
export const createSdkRow = (id, resource, values) => api.post(endpoints.sdkApps.rows(id, resource), values)

/** PATCH .../resources/<resource>/<rowId> { changed fields } -> { resource, row } */
export const updateSdkRow = (id, resource, rowId, values) => api.patch(endpoints.sdkApps.row(id, resource, rowId), values)

/** DELETE .../resources/<resource>/<rowId> -> { resource, deleted } */
export const deleteSdkRow = (id, resource, rowId) => api.del(endpoints.sdkApps.row(id, resource, rowId))

/** POST /api/apps/<id>/actions/<action> { input } -> { action, result } */
export const runSdkAction = (id, action, input) => api.post(endpoints.sdkApps.action(id, action), input || {})

/**
 * What kind of failure is this, in the terms the screen cares about?
 *
 *   offline         no answer at all (status 0)
 *   not_configured  503 code not_configured: the SDK records table is not applied yet
 *   not_installed   409 code not_installed: the app was removed (or switched off) while open
 *   not_sdk         404 on the descriptor: this store item is not an SDK app
 *   forbidden       403: the business is not entitled / not linked
 *   signed_out      401
 *   invalid         422 with field errors
 *   server          anything else
 *
 * `message` is the API's own sentence when it sent one that is safe to show.
 */
export function classifyError(err) {
  const status = Number(err?.status) || 0
  const code = err?.body?.code || ''
  const errors = err?.body?.errors && typeof err.body.errors === 'object' ? err.body.errors : null
  const message = typeof err?.body?.error === 'string' ? err.body.error : ''
  if (status === 0) return { kind: 'offline', status, message: '', errors: null }
  if (status === 503 && code === 'not_configured') return { kind: 'not_configured', status, message, errors: null }
  if (status === 409 && code === 'not_installed') return { kind: 'not_installed', status, message, errors: null }
  if (status === 404) return { kind: 'not_found', status, message, errors: null }
  if (status === 403) return { kind: 'forbidden', status, message, errors: null }
  if (status === 401) return { kind: 'signed_out', status, message, errors: null }
  if (status === 422 || (status === 400 && errors)) return { kind: 'invalid', status, message, errors }
  return { kind: 'server', status, message, errors }
}
