// The only calls the setup flow makes, all to endpoints that already exist.
// The business is never named in a request; the API reads it from the session.

import { api } from '../lib/apiClient'
import { endpoints } from '../lib/endpoints'
import { fetchAppStore, connectTool, refreshTool } from '../lib/appStore'
import { fetchIndustries } from '../lib/industries'

/** GET /api/store — what this business may install, and what it has. */
export const loadStoreItems = async () => {
  const body = await api.get(endpoints.store.list())
  return Array.isArray(body?.items) ? body.items : []
}

/** POST /api/store/:id/install. A 409 with permissions is the "asks for access" case. */
export const installApp = (id, acceptPermissions = false) =>
  api.post(endpoints.store.install(id), { accept_permissions: acceptPermissions })

/** GET /api/connections — Composio tools with this business's connection state. */
export const loadTools = fetchAppStore

/** GET /api/business/industries, falling back to the built-in list on failure. */
export const loadIndustries = fetchIndustries

// The OAuth page is Composio's. Starting it and reconciling afterwards use the
// same calls as AppStore.jsx (connectTool / refreshTool); only the new tab and
// the "came back" signal are repeated here, because AppStore keeps them inside
// its component.
export { connectTool, refreshTool }
