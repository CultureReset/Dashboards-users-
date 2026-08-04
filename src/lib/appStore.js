import { api } from './apiClient'
import { endpoints } from './endpoints'

// The App Store, as a business sees it.
//
// Everything goes through gcr-api-clean at /api/connections — the Composio key
// never reaches a browser, and the business's own slug is resolved server-side
// from entity_owners rather than sent from here. There is nothing this file
// could put in a request that would let it act on another business.
//
// This file already did the right thing; it only borrowed the session token
// from the database client to prove who was calling. That client is gone now,
// so the token comes from the auth store instead — and because the request
// goes through apiClient, it also picks up the timeout, the error shape and
// the automatic token renewal that its own small fetch wrapper did not have.

/**
 * Every tool on offer, each carrying this business's connection if it has one.
 * Returns { entity_slug, tools, categories, composio_configured }.
 */
export const fetchAppStore = () => api.get(endpoints.connections.list())

/**
 * Begin connecting. Returns a redirect_url the owner must visit to authorise.
 * Composio handles the OAuth — no credentials are typed here or held by us.
 */
export const connectTool = (toolId) => api.post(endpoints.connections.connect(toolId))

/** Ask the server to reconcile with Composio after the owner comes back. */
export const refreshTool = (toolId) => api.post(endpoints.connections.refresh(toolId))

export const disconnectTool = (toolId) => api.del(endpoints.connections.disconnect(toolId))

/**
 * Group tools for display. Categories come from Composio, but a tool can carry
 * several and plenty carry none, so this builds the list from what the tools
 * actually have rather than trusting the category table to cover everything.
 */
export function groupByCategory(tools, categories = []) {
  const names = Object.fromEntries(categories.map((c) => [c.cat_id, c.name]))
  const groups = new Map()

  for (const tool of tools) {
    const keys = tool.cat ? [tool.cat] : ['other']
    for (const key of keys) {
      if (!groups.has(key)) groups.set(key, { key, label: names[key] || humanize(key), tools: [] })
      groups.get(key).tools.push(tool)
    }
  }

  return [...groups.values()].sort((a, b) => {
    // "Other" last; everything else by how much is in it, so the big
    // categories are what someone sees first.
    if (a.key === 'other') return 1
    if (b.key === 'other') return -1
    return b.tools.length - a.tools.length
  })
}

function humanize(key) {
  return String(key).replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

/** Case-insensitive match on name, description and category. */
export function searchTools(tools, query) {
  const q = query.trim().toLowerCase()
  if (!q) return tools
  return tools.filter((t) =>
    [t.name, t.description, t.cat, t.tool_id].filter(Boolean).some((v) => String(v).toLowerCase().includes(q))
  )
}
