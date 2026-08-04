import { supabase } from './supabaseClient'
import { GCR_API_BASE } from './config'

// The App Store, as a business sees it.
//
// Everything goes through gcr-api-clean at /api/connections — the Composio key
// never reaches a browser, and the business's own slug is resolved server-side
// from entity_owners rather than sent from here. There is nothing this file
// could put in a request that would let it act on another business.

const API = `${GCR_API_BASE}/api/connections`

/** The Supabase session token the API verifies to work out who is calling. */
async function authHeaders() {
  const { data } = await supabase.auth.getSession()
  const token = data?.session?.access_token
  if (!token) throw new Error('You are signed out — sign in again.')
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
}

async function call(path, { method = 'GET', body } = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: await authHeaders(),
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const err = new Error(data.error || `Request failed (${res.status})`)
    Object.assign(err, data)
    throw err
  }
  return data
}

/**
 * Every tool on offer, each carrying this business's connection if it has one.
 * Returns { entity_slug, tools, categories, composio_configured }.
 */
export const fetchAppStore = () => call('/')

/**
 * Begin connecting. Returns a redirect_url the owner must visit to authorise.
 * Composio handles the OAuth — no credentials are typed here or held by us.
 */
export const connectTool = (toolId) => call(`/${encodeURIComponent(toolId)}/connect`, { method: 'POST' })

/** Ask the server to reconcile with Composio after the owner comes back. */
export const refreshTool = (toolId) => call(`/${encodeURIComponent(toolId)}/refresh`, { method: 'POST' })

export const disconnectTool = (toolId) => call(`/${encodeURIComponent(toolId)}`, { method: 'DELETE' })

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
