// What the launcher shows, as plain data.
//
// buildTiles() turns what the business already has into tiles. It invents
// nothing: every tile comes from one of four sources, and none of them is a
// list of industries.
//
//   app   an installed Store app that has a screen in this dashboard
//         (Merch Store, Song Request). Apps are industry-agnostic: a
//         restaurant, an artist and a fishing charter get the same tile.
//   sdk   any other installed Store app. Its tile comes from its manifest
//         (name, icon, surfaces) — see tileFromManifest().
//   data  a data section the business has (hours, menu, photos, ...), found by
//         discovery. Hidden tables never get one.
//   core  Setup, Calendar, Tools, Automations, My Ghost (Platform is offered
//         but starts hidden).
//
// Pure data and no React, so scripts/check-front.mjs can test it under node.
// Explicit .js extensions for the same reason.

import { MANAGE_TABS } from '../lib/dashboardView.js'
import { isInternal } from '../lib/sectionCatalog.js'
import { CATALOG_KEY_TO_SECTION } from '../lib/moduleNav.js'
import { tableFor as defaultTableFor } from '../lib/tableMap.js'

/** Normalise the many spellings of one key: merch_store, Merch-Store, ... */
const norm = (key) => String(key ?? '').trim().toLowerCase().replace(/[\s_]+/g, '-')

/**
 * Store apps that already have a screen in this dashboard. They are matched by
 * key, not by industry: nothing here says which kind of business may use them.
 * `noun` is only for the one-line status ("3 requests").
 */
const BUILT_IN_APPS = {
  'merch-store': { key: 'merch-store', noun: ['product', 'products'] },
  'song-request': { key: 'song-request', noun: ['request', 'requests'] },
}

/** How a data section counts its rows in the one-line status. */
const UNITS = {
  hours: ['day', 'days'],
  photos: ['photo', 'photos'],
  reviews: ['review', 'reviews'],
  events: ['event', 'events'],
  faqs: ['FAQ', 'FAQs'],
  menu_sections: ['section', 'sections'],
  drink_sections: ['section', 'sections'],
  happy_hour_sections: ['section', 'sections'],
  specials: ['special', 'specials'],
  policies: ['policy', 'policies'],
  team: ['person', 'people'],
  products: ['product', 'products'],
}

const plural = (n, [one, many]) => `${n} ${n === 1 ? one : many}`

/** The table behind a section, for the hidden-table and absorb checks. */
function tableOf(section, tableFor) {
  return section.table || tableFor(section.key) || section.key
}

function rowsOf(section) {
  return Array.isArray(section?.data) ? section.data : []
}

/** Tile-sized versions of the More sheet's hints (a tile has room for about 20 characters). */
const SHORT_HINTS = { calendar: 'Bookings and iCal', tools: 'Gmail, Square, more', ghost: 'Your box on site' }

/** Core tiles. Labels, icons and hints come from the same list the More sheet uses. */
const CORE = [
  { id: 'setup', name: 'Setup', icon: '🏠', hint: 'Get your business ready', view: 'setup' },
  ...['calendar', 'tools', 'automations', 'ghost'].map((view) => MANAGE_TABS.find((t) => t.view === view)).map((t) => ({
    id: t.view, name: t.label, icon: t.icon, hint: SHORT_HINTS[t.view] || t.hint, view: t.view,
  })),
  // Reachable (it used to be a More item) but not in the default grid.
  ...MANAGE_TABS.filter((t) => t.view === 'platform').map((t) => ({
    id: 'platform', name: t.label, icon: t.icon, hint: t.hint, view: t.view, defaultHidden: true,
  })),
]

/** The tile that opens the Store. Not part of the reorderable list. */
export const ADD_APP_TILE = Object.freeze({
  id: 'add-app',
  kind: 'add',
  name: 'Add app',
  icon: '＋',
  status: 'Browse the store',
  badge: null,
  attention: false,
  target: { view: 'store' },
})

/**
 * An SDK app's tile, from its manifest. Reads only name, icon and surfaces;
 * anything else in the manifest is ignored here. `item` is the Store row the
 * manifest came with (it supplies fallbacks and the install state).
 *
 * `surfaces` is kept on the tile so a later AppFrame can mount the right one;
 * today every SDK tile opens the Store entry for the app (see docs).
 */
export function tileFromManifest(manifest, item = {}) {
  const m = manifest && typeof manifest === 'object' ? manifest : {}
  const name = String(m.name || m.dashboard?.label || item.name || m.app_key || item.id || 'App').trim()
  const rawSurfaces = m.surfaces
  const surfaces = Array.isArray(rawSurfaces)
    ? rawSurfaces.map((s) => (typeof s === 'string' ? s : s?.type || s?.name)).filter(Boolean)
    : rawSurfaces && typeof rawSurfaces === 'object'
      ? Object.keys(rawSurfaces)
      : []
  const off = item.installed?.status === 'disabled'
  const version = item.installed?.semver || (item.installed?.version ? `v${item.installed.version}` : '')
  return {
    id: `sdk:${item.id ?? norm(name)}`,
    kind: 'sdk',
    name,
    icon: m.icon || item.icon || '📦',
    status: off ? 'Switched off' : item.update_available ? 'Update ready' : version ? `Installed · ${version}` : 'Installed',
    badge: item.update_available ? 'Update' : null,
    attention: !!item.update_available,
    off,
    surfaces,
    target: { view: 'store' },
  }
}

function manifestOf(item) {
  return item.manifest || item.installed?.manifest || item.available?.manifest || null
}

/** Which of the store item's identifiers name a built-in app, if any. */
function builtInFor(item) {
  const candidates = [item.key, item.module_key, item.app_key, item.slug, item.name].map(norm)
  return candidates.map((c) => BUILT_IN_APPS[c]).find(Boolean) || null
}

/**
 * @param {object} input
 * @param {object[]} input.sections       Dashboard's sections (already filtered by owner-visible tables)
 * @param {object[]} input.storeItems     GET /api/store items (installed or not)
 * @param {number}   input.automationsCount
 * @param {string[]|null} input.ownerVisibleTables  the allow-list, when the API sent one
 * @param {(key: string) => string|null} input.tableFor
 * @returns {object[]} tiles in default order: apps, data, core
 */
export function buildTiles({
  sections = [],
  storeItems = [],
  automationsCount = 0,
  ownerVisibleTables = null,
  tableFor = defaultTableFor,
} = {}) {
  const allow = Array.isArray(ownerVisibleTables) && ownerVisibleTables.length
    ? new Set(ownerVisibleTables.map((t) => String(t).trim()))
    : null

  // A table the owner is not allowed to see, or that is platform machinery,
  // never becomes a tile — whatever else says it has rows. An installed module
  // stub is the one exception, matching polishOwnerSections: it has an empty
  // state and no table of its own to be vetted.
  const visible = (sections || []).filter((s) => {
    if (!s || !s.key) return false
    const table = tableOf(s, tableFor)
    if (isInternal(table) || isInternal(s.key)) return false
    if (s.installed === true && s.fromModule) return true
    if (allow && !allow.has(table) && !allow.has(s.key)) return false
    return true
  })

  const installedItems = (storeItems || []).filter((i) => i && i.installed)
  const apps = []
  const absorbedTables = new Set()
  const usedSections = new Set()
  const seenApps = new Set()

  const addApp = ({ builtIn, item, section }) => {
    if (seenApps.has(builtIn.key)) return
    seenApps.add(builtIn.key)
    const table = (CATALOG_KEY_TO_SECTION[builtIn.key] || CATALOG_KEY_TO_SECTION[builtIn.key.replace(/-/g, '_')])?.table
    // The app's own rows may sit in the app section or in the table discovery
    // swept for it (products, song_requests). Count whichever has them.
    const own = rowsOf(section)
    const swept = table ? visible.find((s) => s !== section && tableOf(s, tableFor) === table) : null
    if (swept) { absorbedTables.add(tableOf(swept, tableFor)); usedSections.add(swept) }
    if (section) usedSections.add(section)
    const rows = own.length ? own : rowsOf(swept)
    const fresh = builtIn.key === 'song-request'
      ? rows.filter((r) => r?.status === 'new' || r?.request_status === 'submitted').length
      : 0
    const off = item?.installed?.status === 'disabled'
    const update = !!item?.update_available
    let status
    if (off) status = 'Switched off'
    else if (fresh) status = `${fresh} new`
    else if (rows.length) status = plural(rows.length, builtIn.noun)
    else status = `No ${builtIn.noun[1]} yet`
    apps.push({
      id: `app:${builtIn.key}`,
      kind: 'app',
      name: item?.name || section?.label || (builtIn.key === 'song-request' ? 'Song Request' : 'Merch Store'),
      icon: item?.icon || section?.icon || '📦',
      status: update && !off ? 'Update ready' : status,
      badge: update ? 'Update' : fresh || null,
      attention: update || fresh > 0,
      off,
      // A switched-off app opens its Store entry so it can be switched back on.
      target: off ? { view: 'store' } : { view: 'section', key: builtIn.key },
    })
  }

  const sdk = []
  for (const item of installedItems) {
    const builtIn = builtInFor(item)
    if (builtIn) {
      const section = visible.find((s) => norm(s.key) === builtIn.key || norm(s.catalogKey) === builtIn.key)
      addApp({ builtIn, item, section })
    } else {
      sdk.push(tileFromManifest(manifestOf(item), item))
    }
  }
  // Built-in apps installed as modules that the store list did not (or could
  // not) report: the module stub is the install record.
  for (const s of visible) {
    const builtIn = BUILT_IN_APPS[norm(s.key)] || BUILT_IN_APPS[norm(s.catalogKey)]
    if (builtIn && s.fromModule && s.installed === true) addApp({ builtIn, item: null, section: s })
  }

  const data = []
  for (const s of visible) {
    if (usedSections.has(s)) continue
    const table = tableOf(s, tableFor)
    if (absorbedTables.has(table)) continue
    const stub = s.empty === true || s.has_data === false
    if (stub && !(s.fromModule && s.installed)) continue // nothing to open, nothing installed
    const rows = rowsOf(s)
    data.push({
      id: `data:${s.key}`,
      kind: 'data',
      name: s.label || s.key,
      icon: s.icon || '📋',
      status: stub
        ? 'Not set up'
        : s.kind === 'record' ? 'Details' : plural(rows.length, UNITS[s.key] || UNITS[table] || ['item', 'items']),
      badge: null,
      attention: stub,
      off: false,
      target: { view: 'section', key: s.key },
    })
  }

  const hasAnything = apps.length + sdk.length + data.length > 0
  const core = CORE.map((c) => {
    const base = {
      id: `core:${c.id}`,
      kind: 'core',
      name: c.name,
      icon: c.icon,
      status: c.hint,
      badge: null,
      attention: false,
      off: false,
      defaultHidden: !!c.defaultHidden,
      target: { view: c.view },
    }
    if (c.id === 'setup') {
      return hasAnything ? { ...base, status: 'Your checklist' } : { ...base, status: 'Start here', attention: true }
    }
    if (c.id === 'automations') {
      return automationsCount > 0
        ? { ...base, status: plural(automationsCount, ['workflow', 'workflows']), badge: automationsCount, attention: true }
        : { ...base, status: 'None yet' }
    }
    return base
  })

  return [...apps, ...sdk, ...data, ...core]
}
