/**
 * Module → dashboard section mapping and nav merge.
 *
 * Mirrors gcr-api-clean/lib/moduleKeys.js (PR #80): aliases collapse to
 * canonical keys the API returns (gallery → photos, menu → menu_sections).
 * GET /api/owner/modules already returns canonical keys; this file still
 * canonicalizes so local/fallback paths stay consistent, and maps each
 * canonical key to the dashboard section / table.
 *
 * Prefer catalog mappings from the owner-modules API response when present
 * (see applyCatalogFromApi). Keep every existing data-discovered section;
 * union enabled modules so empty-but-enabled modules still get a tab.
 * When has_data is false (or local data is missing), the section is empty
 * and Dashboard shows EmptyModulePanel.
 */

import { labelFor, iconFor } from './discoverSections.js'

/** Same aliases as gcr-api-clean/lib/moduleKeys.js (PR #80). */
export const ALIASES = Object.freeze({
  gallery: 'photos',
  menu: 'menu_sections',
})

/** Map an alias (or already-canonical key) to the one key we store and show. */
export function canonicalize(key) {
  const raw = String(key || '').trim().toLowerCase()
  if (!raw) return null
  return ALIASES[raw] || raw
}

/**
 * Canonical module key → dashboard section metadata.
 * sectionKey is the nav / API payload key (same as canonical for live keys).
 * Keys with sectionKey null are profile-level and do not become nav tabs.
 */
export const CATALOG_KEY_TO_SECTION = {
  core: { sectionKey: null, table: 'entity', reason: 'profile_fields' },
  hours: { sectionKey: 'hours', table: 'entity_hours' },
  photos: { sectionKey: 'photos', table: 'entity_photos' },
  gallery: { sectionKey: 'photos', table: 'entity_photos' }, // alias
  reviews: { sectionKey: 'reviews', table: 'entity_reviews' },
  faqs: { sectionKey: 'faqs', table: 'faqs' },
  team: { sectionKey: 'team', table: 'entity_team_members' },
  policies: { sectionKey: 'policies', table: 'entity_policies' },
  announcements: { sectionKey: 'announcements', table: 'announcements' },
  blog: { sectionKey: 'blog_posts', table: 'entity_blog_posts' },
  blog_posts: { sectionKey: 'blog_posts', table: 'entity_blog_posts' },
  booking: { sectionKey: 'bookable_resources', table: 'bookable_resources' },
  bookable_resources: { sectionKey: 'bookable_resources', table: 'bookable_resources' },
  pricing: { sectionKey: 'pricing', table: 'pricing_items' },
  schedule: { sectionKey: 'schedules', table: 'activity_schedules' },
  schedules: { sectionKey: 'schedules', table: 'activity_schedules' },
  events: { sectionKey: 'events', table: 'entity_events' },
  services: { sectionKey: 'service_menu', table: 'service_menu' },
  service_menu: { sectionKey: 'service_menu', table: 'service_menu' },
  menu: { sectionKey: 'menu_sections', table: 'menu_sections' }, // alias
  menu_sections: { sectionKey: 'menu_sections', table: 'menu_sections' },
  drinks: { sectionKey: 'drink_sections', table: 'drink_sections' },
  drink_sections: { sectionKey: 'drink_sections', table: 'drink_sections' },
  happy_hour: { sectionKey: 'happy_hour_sections', table: 'happy_hour_sections' },
  happy_hour_sections: { sectionKey: 'happy_hour_sections', table: 'happy_hour_sections' },
  specials: { sectionKey: 'specials', table: 'entity_specials' },
  shop: { sectionKey: 'products', table: 'products' },
  products: { sectionKey: 'products', table: 'products' },
  loyalty: { sectionKey: 'loyalty_program', table: 'loyalty_programs' },
  loyalty_program: { sectionKey: 'loyalty_program', table: 'loyalty_programs' },
  amenities: { sectionKey: 'amenities', table: 'amenities' },
  stay: { sectionKey: 'property_details', table: 'property_details' },
  property_details: { sectionKey: 'property_details', table: 'property_details' },
  rooms: { sectionKey: 'room_types', table: 'room_types' },
  room_types: { sectionKey: 'room_types', table: 'room_types' },
  park: { sectionKey: 'facilities', table: 'facilities' },
  facilities: { sectionKey: 'facilities', table: 'facilities' },
  activity: { sectionKey: 'activity_details', table: 'activity_details' },
  activity_details: { sectionKey: 'activity_details', table: 'activity_details' },
  offerings: { sectionKey: 'offerings', table: 'offerings' },
  highlights: { sectionKey: 'about_bullets', table: 'entity_about_bullets' },
  about_bullets: { sectionKey: 'about_bullets', table: 'entity_about_bullets' },
  whats_included: { sectionKey: 'whats_included', table: 'whats_included' },
  best_for: { sectionKey: 'perfect_for', table: 'entity_perfect_for' },
  perfect_for: { sectionKey: 'perfect_for', table: 'entity_perfect_for' },
}

/** Reverse: section key → preferred catalog key (first match wins). */
export const SECTION_TO_CATALOG_KEY = Object.fromEntries(
  Object.entries(CATALOG_KEY_TO_SECTION)
    .filter(([, v]) => v.sectionKey)
    .map(([catalogKey, v]) => [v.sectionKey, catalogKey]),
)

/**
 * Runtime override populated from the owner-modules / catalog API response.
 * Shape: Map(catalogKey → { sectionKey, table?, label?, icon? })
 */
let apiCatalogOverride = null

/**
 * Prefer API-provided catalog mappings when the owner-modules response includes
 * them. Accepts several shapes so we adapt without rewriting call sites.
 *
 * Recognized shapes (any one):
 *   { catalog: [{ key, section_key|sectionKey, table, label, icon }] }
 *   { mappings: { gallery: 'photos' | { section_key, table, … } } }
 *   { modules: [{ key, section_key, table, … }] }  // only rows that carry a map
 */
export function applyCatalogFromApi(payload) {
  if (!payload || typeof payload !== 'object') {
    apiCatalogOverride = null
    return null
  }
  const map = new Map()

  const rows = Array.isArray(payload.catalog)
    ? payload.catalog
    : Array.isArray(payload.module_catalog)
      ? payload.module_catalog
      : null

  if (rows) {
    for (const row of rows) {
      const key = canonicalize(row?.key || row?.module_key)
      if (!key) continue
      const sectionKey = row.section_key ?? row.sectionKey ?? row.nav_key ?? key
      map.set(key, {
        sectionKey: sectionKey || null,
        table: row.table || row.table_name || null,
        label: row.label || row.name || null,
        icon: row.icon || null,
      })
    }
  }

  if (payload.mappings && typeof payload.mappings === 'object' && !Array.isArray(payload.mappings)) {
    for (const [rawKey, value] of Object.entries(payload.mappings)) {
      const key = canonicalize(rawKey)
      if (!key) continue
      if (typeof value === 'string') {
        map.set(key, { sectionKey: canonicalize(value) || value, table: null, label: null, icon: null })
      } else if (value && typeof value === 'object') {
        map.set(key, {
          sectionKey: canonicalize(value.section_key ?? value.sectionKey ?? value.key) || null,
          table: value.table || null,
          label: value.label || value.name || null,
          icon: value.icon || null,
        })
      }
    }
  }

  if (Array.isArray(payload.modules)) {
    for (const row of payload.modules) {
      const key = canonicalize(row?.key || row?.module_key)
      const sectionKey = row?.section_key ?? row?.sectionKey
      if (!key || sectionKey == null || sectionKey === '') continue
      if (!map.has(key)) {
        map.set(key, {
          sectionKey: String(canonicalize(sectionKey) || sectionKey),
          table: row.table || null,
          label: row.label || row.name || null,
          icon: row.icon || null,
        })
      }
    }
  }

  apiCatalogOverride = map.size ? map : null
  return apiCatalogOverride
}

export function clearCatalogFromApi() {
  apiCatalogOverride = null
}

/** Resolve one catalog key through API override, else local fallback. */
export function resolveCatalogKey(catalogKey) {
  const key = canonicalize(catalogKey)
  if (!key) return null
  if (apiCatalogOverride?.has(key)) return apiCatalogOverride.get(key)
  if (CATALOG_KEY_TO_SECTION[key]) return CATALOG_KEY_TO_SECTION[key]
  // Unknown canonical key: treat as its own section (API already canonicalized).
  return { sectionKey: key, table: null, label: null, icon: null }
}

export function sectionKeyForCatalog(catalogKey) {
  const resolved = resolveCatalogKey(catalogKey)
  return resolved?.sectionKey ?? null
}

/**
 * Normalize GET /api/owner/modules into
 * [{ key, enabled, has_data?, sort_order?, sectionKey?, label?, icon? }].
 * Keeps has_data from the wire (gcr-api-clean #83) so empty-but-enabled
 * modules can show an empty state. Accepts common aliases; stores canonical keys.
 */
export function normalizeModulesList(payload) {
  if (!payload) return []
  const raw = Array.isArray(payload)
    ? payload
    : Array.isArray(payload.modules)
      ? payload.modules
      : Array.isArray(payload.items)
        ? payload.items
        : []

  return raw
    .map((row, index) => {
      if (!row || typeof row !== 'object') return null
      const key = canonicalize(row.key || row.module_key || row.moduleKey || row.id)
      if (!key) return null
      const enabled = row.enabled !== false && row.status !== 'disabled' && row.on !== false
      const resolved = resolveCatalogKey(key)
      // Prefer explicit row section; else catalog (may be null for core); else key.
      // Do not use ?? on resolved.sectionKey alone — null means "no nav tab".
      let sectionKey = row.section_key ?? row.sectionKey
      if (sectionKey === undefined) {
        sectionKey = resolved ? resolved.sectionKey : key
      }
      const hasDataRaw = row.has_data ?? row.hasData
      return {
        key,
        enabled: !!enabled,
        // undefined when the API omits it — callers treat missing as "unknown"
        has_data: hasDataRaw === undefined ? undefined : !!hasDataRaw,
        sort_order: row.sort_order ?? row.sortOrder ?? row.order ?? index,
        sectionKey,
        label: row.label || row.name || resolved?.label || null,
        icon: row.icon || resolved?.icon || null,
        table: row.table || resolved?.table || null,
      }
    })
    .filter(Boolean)
}

/**
 * Build nav section stubs for enabled modules that have a section key.
 * empty: true when the business has no rows for that domain yet.
 */
export function sectionsFromEnabledModules(modules, entity) {
  const out = []
  const seen = new Set()
  const enabled = (modules || []).filter((m) => m.enabled)
  enabled.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))

  for (const mod of enabled) {
    const sectionKey = mod.sectionKey || sectionKeyForCatalog(mod.key)
    if (!sectionKey || seen.has(sectionKey)) continue
    seen.add(sectionKey)
    const data = entity?.[sectionKey]
    const hasRows = Array.isArray(data)
      ? data.length > 0
      : data && typeof data === 'object'
        ? Object.values(data).some((v) => v !== null && v !== undefined && v !== '')
        : false
    // Prefer API has_data when present (enabled && !has_data → empty state).
    // Fall back to local row presence when the field is omitted.
    const empty = mod.has_data === false ? true : !hasRows
    out.push({
      key: sectionKey,
      catalogKey: mod.key,
      label: mod.label || labelFor(sectionKey),
      icon: mod.icon || iconFor(sectionKey),
      kind: Array.isArray(data) || empty ? 'list' : 'record',
      data: empty ? [] : data,
      empty,
      has_data: mod.has_data,
      fromModule: true,
    })
  }
  return out
}

/**
 * Union: every data-discovered section (keep all existing screens) plus
 * enabled-module stubs that discovery did not already produce.
 */
export function mergeModuleAndDiscoveredSections(discovered, moduleSections) {
  const byKey = new Map()
  for (const s of discovered || []) {
    byKey.set(s.key, { ...s, empty: false, fromModule: false })
  }
  for (const s of moduleSections || []) {
    if (byKey.has(s.key)) {
      const existing = byKey.get(s.key)
      byKey.set(s.key, {
        ...existing,
        catalogKey: s.catalogKey || existing.catalogKey,
        fromModule: existing.fromModule || s.fromModule,
      })
    } else {
      byKey.set(s.key, s)
    }
  }
  return [...byKey.values()]
}

/**
 * Final owner-nav pass (data-driven, no per-business hardcoding):
 * 1. When the API returns owner_visible_tables, drop discovered sections whose
 *    backing table is not on that list (internal/raw contract rows).
 * 2. Dedupe tabs that share the same label (keep the one with data / preferred key).
 * 3. Hide empty tabs (no rows / has_data === false).
 *
 * @param {object[]} sections
 * @param {{ ownerVisibleTables?: string[]|null, tableFor?: (key: string) => string|null }} [opts]
 */
export function polishOwnerSections(sections, opts = {}) {
  const tableForFn = opts.tableFor || ((key) => key)
  const allow = Array.isArray(opts.ownerVisibleTables) && opts.ownerVisibleTables.length
    ? new Set(opts.ownerVisibleTables.map((t) => String(t).trim()).filter(Boolean))
    : null

  let list = [...(sections || [])]

  if (allow) {
    list = list.filter((s) => {
      // Module stubs without a swept table still need a chance when enabled+has_data
      // was already filtered by the API — keep fromModule with has_data !== false
      // only if their catalog table is allowed or unknown.
      const table = tableForFn(s.key) || s.table || s.key
      if (allow.has(table)) return true
      // API key might already be the table name
      if (allow.has(s.key)) return true
      // If we cannot map and it came only from discovery, hide it when a
      // visibility list is in force — that list is the source of truth.
      if (s.fromModule && s.has_data !== false && s.empty !== true) {
        const catalogTable = s.table
        if (!catalogTable) return true
        return allow.has(catalogTable)
      }
      return false
    })
  }

  // Hide empty tabs
  list = list.filter((s) => {
    if (s.empty === true) return false
    if (s.has_data === false) return false
    const data = s.data
    if (Array.isArray(data) && data.length === 0) return false
    return true
  })

  // Dedupe by normalized label
  const byLabel = new Map()
  for (const s of list) {
    const label = String(s.label || s.key || '').trim().toLowerCase()
    if (!label) continue
    const prev = byLabel.get(label)
    if (!prev) {
      byLabel.set(label, s)
      continue
    }
    // Prefer the one with more data / non-empty / shorter canonical key
    const score = (x) => {
      let n = 0
      if (x.empty) n -= 10
      if (Array.isArray(x.data)) n += Math.min(x.data.length, 50)
      else if (x.data && typeof x.data === 'object') n += 5
      if (x.fromModule) n += 1
      // Prefer offerings over generic "sections" when labels collide
      if (x.key === 'offerings' || x.key === 'sections') n += x.key === 'offerings' ? 3 : 0
      return n
    }
    if (score(s) > score(prev)) byLabel.set(label, s)
  }
  return [...byLabel.values()]
}
