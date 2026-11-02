#!/usr/bin/env node
/**
 * Prove the launcher's logic without a browser, a network or a database.
 *
 *   node scripts/check-front.mjs
 *
 * Four realistic businesses go through the same pipeline the dashboard uses
 * (discovery -> module stubs -> owner polish -> buildTiles), and the checks
 * look at the things that would actually go wrong:
 *
 *   - the same app looks the same whatever the industry
 *   - an app is one tile, not a tile for the app plus a tile for its table
 *   - a table the owner may not see never becomes a tile
 *   - order and hiding survive a reload, per business, and a bad store is harmless
 *   - the launcher replaces Setup only when there is something to show
 */

import { mergeEntitySources, discoverSections } from '../src/lib/discoverSections.js'
import {
  normalizeModulesList, sectionsFromEnabledModules, mergeModuleAndDiscoveredSections, polishOwnerSections,
} from '../src/lib/moduleNav.js'
import { tableFor } from '../src/lib/tableMap.js'
import { INITIAL_VIEW, VIEWS, landingView, viewReducer } from '../src/lib/dashboardView.js'
import { buildTiles, tileFromManifest, ADD_APP_TILE } from '../src/front/tiles.js'
import {
  EMPTY_LAYOUT, applyLayout, hideTile, loadLayout, moveTile, saveLayout, showTile, clearLayout,
} from '../src/front/layout.js'

let failures = 0
function check(label, condition, detail = '') {
  if (condition) console.log(`  ok    ${label}`)
  else {
    failures++
    console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ''}`)
  }
}

/** The dashboard's own pipeline, for one business. */
function pipeline({ entity = {}, swept = {}, modules = null, ownerVisibleTables = null, storeItems = [], automationsCount = 0 }) {
  const merged = mergeEntitySources(entity, swept)
  const discovered = discoverSections(merged)
  let sections = discovered
  const apiOn = modules !== null
  if (apiOn) {
    const stubs = sectionsFromEnabledModules(normalizeModulesList({ modules }), merged)
    sections = mergeModuleAndDiscoveredSections(discovered, stubs)
  }
  sections = polishOwnerSections(sections, { ownerVisibleTables: apiOn ? ownerVisibleTables : null, tableFor })
  return buildTiles({
    sections, storeItems, automationsCount, ownerVisibleTables: apiOn ? ownerVisibleTables : null, tableFor,
  })
}

const ids = (tiles) => tiles.map((t) => t.id)
const byId = (tiles, id) => tiles.find((t) => t.id === id)
const CORE_IDS = ['core:setup', 'core:calendar', 'core:tools', 'core:automations', 'core:ghost']

const merchItem = {
  id: 'store-merch', key: 'merch-store', name: 'Merch Store', icon: '🛍️',
  installed: { status: 'enabled', semver: '1.2.0', settings: [], config: {} }, entitled: true, update_available: false,
}
const songItem = {
  id: 'store-song', key: 'song-request', name: 'Song Request', icon: '🎧',
  installed: { status: 'enabled', semver: '0.9.0', settings: [], config: {} }, entitled: true, update_available: false,
}
const merchModule = { key: 'merch-store', enabled: true, installed: true, has_data: false }
const songModule = { key: 'song-request', enabled: true, installed: true, has_data: true }

// ── four businesses ─────────────────────────────────────────────────────────
const restaurantEntity = {
  slug: 'harbor-grill', name: 'Harbor Grill',
  hours: [{ id: 1, day_of_week: 1, opens_at: '11:00', closes_at: '22:00' }, { id: 2, day_of_week: 2, opens_at: '11:00', closes_at: '22:00' }],
  photos: [{ id: 7, url: 'https://example.test/a.jpg' }],
  menu_sections: [{ id: 3, section_name: 'Starters', items: [] }],
}
const artistEntity = {
  slug: 'get-sideways', name: 'Get Sideways',
  events: [{ id: 1, event_name: 'Pier show', event_date: '2026-08-14' }],
  photos: [{ id: 2, url: 'https://example.test/b.jpg' }],
}
const charterEntity = {
  slug: 'perdido-charters', name: 'Perdido Charters',
  hours: [{ id: 1, day_of_week: 1, opens_at: '05:00', closes_at: '17:00' }],
  photos: [{ id: 1, url: 'https://example.test/c.jpg' }],
  meeting_points: [{ id: 1, name: 'Dock C' }],
  fish_species: [{ id: 5, species: 'Red Snapper' }, { id: 6, species: 'Grouper' }],
  what_to_bring: [{ id: 8, item: 'Sunscreen' }],
  weather_rules: [{ id: 2, rule_type: 'wind' }],
  pricing: [{ id: 4, name: 'Half day', price: 800, tiers: [] }],
  faqs: [{ id: 2, question: 'Kids?', answer: 'Yes.' }],
  policies: [{ id: 3, title: 'Cancellation', body: '24h' }],
  events: [{ id: 11, event_name: 'Tournament' }],
  specials: [{ id: 12, title: 'Weekday deal' }],
  reviews: [{ id: 13, rating: 5 }],
}

console.log('\nAn industry with no apps and no data')
{
  const tiles = pipeline({ entity: { slug: 'new-biz', name: 'New Biz' }, modules: [], ownerVisibleTables: [] })
  const { visible, hidden } = applyLayout(tiles)
  check('it still has the five core tiles', CORE_IDS.every((id) => ids(visible).includes(id)), ids(visible).join())
  check('and nothing else is visible', visible.length === 5, `${visible.length}`)
  check('Platform is offered but starts on the hidden shelf', ids(hidden).join() === 'core:platform')
  check('Setup says where to start and asks for attention',
    byId(tiles, 'core:setup').status === 'Start here' && byId(tiles, 'core:setup').attention)
  check('every tile has an icon, a name and a target',
    tiles.every((t) => t.icon && t.name && t.target?.view))
  check('"Add app" opens the Store', ADD_APP_TILE.target.view === 'store' && ADD_APP_TILE.kind === 'add')
  check('"Add app" is not in the reorderable list', !ids(tiles).includes('add-app'))
  check('nothing installed and nothing to show lands on Setup',
    landingView({ sectionCount: 0, installCount: 0 }) === 'setup')
}

console.log('\nA restaurant with Merch Store installed')
const restaurantTiles = pipeline({
  entity: restaurantEntity,
  swept: { products: [{ id: 1, name: 'Hat' }, { id: 2, name: 'Tee' }, { id: 3, name: 'Mug' }] },
  modules: [merchModule],
  ownerVisibleTables: ['entity_hours', 'entity_photos', 'menu_sections', 'products'],
  storeItems: [merchItem],
})
{
  const merch = byId(restaurantTiles, 'app:merch-store')
  check('Merch Store has a tile', !!merch)
  check('named and iconed from the Store', merch?.name === 'Merch Store' && merch?.icon === '🛍️')
  check('its status counts its products', merch?.status === '3 products', merch?.status)
  check('it opens its own screen', merch?.target.view === 'section' && merch?.target.key === 'merch-store')
  check('one tile for the app, none for its table',
    !ids(restaurantTiles).includes('data:products') && !ids(restaurantTiles).includes('data:merch-store'),
    ids(restaurantTiles).join())
  check('hours, photos and menu are tiles', ['data:hours', 'data:photos', 'data:menu_sections'].every((id) => ids(restaurantTiles).includes(id)))
  check('hours count days', byId(restaurantTiles, 'data:hours').status === '2 days')
  check('menu opens its section', byId(restaurantTiles, 'data:menu_sections').target.key === 'menu_sections')
  check('apps come before data, data before core',
    ids(restaurantTiles).indexOf('app:merch-store') < ids(restaurantTiles).indexOf('data:hours') &&
    ids(restaurantTiles).indexOf('data:menu_sections') < ids(restaurantTiles).indexOf('core:setup'))
  check('with data and an install, Setup stops shouting', byId(restaurantTiles, 'core:setup').attention === false)
  check('ids are unique', new Set(ids(restaurantTiles)).size === restaurantTiles.length)
  check('an install alone is enough to leave Setup behind',
    landingView({ sectionCount: 0, installCount: 1 }) === 'home')
  check('so is a single section', landingView({ sectionCount: 1, installCount: 0 }) === 'home')
}

console.log('\nAn artist with Merch Store and Song Request')
const artistTiles = pipeline({
  entity: artistEntity,
  swept: {
    products: [{ id: 1, name: 'Poster' }],
    song_requests: [
      { id: 1, song: 'Wagon Wheel', status: 'new' },
      { id: 2, song: 'Free Bird', status: 'new' },
      { id: 3, song: 'Margaritaville', status: 'played' },
    ],
  },
  modules: [merchModule, songModule],
  ownerVisibleTables: ['entity_events', 'entity_photos', 'products', 'song_requests'],
  storeItems: [merchItem, songItem],
})
{
  const song = byId(artistTiles, 'app:song-request')
  check('Song Request has a tile', !!song)
  check('"2 new" with a badge that needs attention',
    song?.status === '2 new' && song?.badge === 2 && song?.attention === true, JSON.stringify(song))
  check('its requests table is not a second tile', !ids(artistTiles).includes('data:song_requests'))
  check('Merch Store is one tile', ids(artistTiles).filter((id) => id.startsWith('app:merch')).length === 1)
  check('events and photos are tiles', ['data:events', 'data:photos'].every((id) => ids(artistTiles).includes(id)))
  // Industry-agnostic: the app tile does not depend on who is using it.
  const a = byId(artistTiles, 'app:merch-store')
  const r = byId(restaurantTiles, 'app:merch-store')
  check('Merch Store is the same app for an artist and a restaurant',
    a.name === r.name && a.icon === r.icon && JSON.stringify(a.target) === JSON.stringify(r.target))
  check('a switched-off app opens the Store so it can be switched back on', (() => {
    const off = pipeline({
      entity: artistEntity, modules: [merchModule], storeItems: [{ ...merchItem, installed: { ...merchItem.installed, status: 'disabled' } }],
    })
    const t = byId(off, 'app:merch-store')
    return t.off === true && t.status === 'Switched off' && t.target.view === 'store'
  })())
  check('an available update is flagged', (() => {
    const t = byId(pipeline({ entity: artistEntity, modules: [merchModule], storeItems: [{ ...merchItem, update_available: true }] }), 'app:merch-store')
    return t.attention && t.badge === 'Update'
  })())
  check('with the Store unreachable the module stub still gives the app a tile', (() => {
    const t = pipeline({ entity: artistEntity, modules: [merchModule], storeItems: [] })
    return !!byId(t, 'app:merch-store')
  })())
  check('an app with no rows says so instead of inventing a count',
    byId(pipeline({ entity: artistEntity, modules: [merchModule], storeItems: [merchItem] }), 'app:merch-store').status === 'No products yet')
}

console.log('\nA fishing charter with twelve sections')
const charterTiles = pipeline({ entity: charterEntity })
{
  const data = charterTiles.filter((t) => t.kind === 'data')
  check('twelve data tiles', data.length === 12, `${data.length}: ${data.map((t) => t.id).join()}`)
  check('plus the five core ones visible', applyLayout(charterTiles).visible.length === 17)
  check('species and meeting points are tiles', ['data:fish_species', 'data:meeting_points'].every((id) => ids(charterTiles).includes(id)))
  check('species count says how many', byId(charterTiles, 'data:fish_species').status === '2 items')
  check('no menu, no apps for a charter that did not install any',
    !ids(charterTiles).includes('data:menu_sections') && !charterTiles.some((t) => t.kind === 'app'))
  check('the same code gave a restaurant and a charter nothing in common but core',
    ids(restaurantTiles).filter((id) => id.startsWith('data:') && ids(charterTiles).includes(id)).join() === 'data:hours,data:photos',
    ids(restaurantTiles).filter((id) => id.startsWith('data:') && ids(charterTiles).includes(id)).join())
}

console.log('\nNo tile for a hidden table')
{
  const withAllow = pipeline({
    entity: charterEntity,
    modules: [],
    ownerVisibleTables: ['entity_hours', 'entity_photos', 'meeting_points'],
  })
  check('a table outside owner_visible_tables gets no tile',
    !ids(withAllow).includes('data:fish_species') && !ids(withAllow).includes('data:pricing'), ids(withAllow).join())
  check('tables on the list do', ['data:hours', 'data:photos', 'data:meeting_points'].every((id) => ids(withAllow).includes(id)))

  // Defence in depth: buildTiles is handed sections that polish would have
  // dropped (a caller that forgot), and still refuses them.
  const raw = discoverSections(mergeEntitySources(charterEntity, {}))
  const direct = buildTiles({ sections: raw, ownerVisibleTables: ['entity_hours'], tableFor })
  check('buildTiles enforces the allow-list itself', !ids(direct).includes('data:fish_species') && ids(direct).includes('data:hours'), ids(direct).join())

  const machinery = buildTiles({
    sections: [
      { key: 'ai_photo_index_full', label: 'Ai Photo Index', icon: '📋', kind: 'list', data: [{ id: 1 }] },
      { key: 'entity_owners', label: 'Owners', icon: '📋', kind: 'list', data: [{ id: 1 }] },
      { key: 'hours', label: 'Hours', icon: '🕒', kind: 'list', data: [{ id: 1 }] },
    ],
    tableFor,
  })
  check('platform machinery never gets a tile', !ids(machinery).includes('data:ai_photo_index_full') && !ids(machinery).includes('data:entity_owners'))
  check('while the real section next to it does', ids(machinery).includes('data:hours'))

  const hiddenSong = pipeline({
    entity: artistEntity, swept: { song_requests: [{ id: 1, status: 'new' }] },
    modules: [], ownerVisibleTables: ['entity_events'], storeItems: [],
  })
  check('swept rows in a table the owner may not see do not surface', !ids(hiddenSong).includes('data:song_requests'))

  check('an empty, uninstalled section is not a tile', !ids(buildTiles({
    sections: [{ key: 'faqs', label: 'FAQs', icon: '❓', kind: 'list', data: [], empty: true }], tableFor,
  })).includes('data:faqs'))
  check('an installed section with no rows is "Not set up" and needs attention', (() => {
    const t = byId(buildTiles({
      sections: [{ key: 'faqs', label: 'FAQs', icon: '❓', kind: 'list', data: [], empty: true, fromModule: true, installed: true }], tableFor,
    }), 'data:faqs')
    return t && t.status === 'Not set up' && t.attention
  })())
}

console.log('\nSDK apps get a tile from their manifest')
{
  const manifest = { app_key: 'tide-alerts', name: 'Tide Alerts', icon: '🌊', surfaces: ['owner', 'guest'], permissions: ['read:entity'] }
  const t = tileFromManifest(manifest, { id: 'app-9', installed: { status: 'enabled', semver: '2.0.1' } })
  check('name and icon come from the manifest', t.name === 'Tide Alerts' && t.icon === '🌊')
  check('surfaces are kept for the frame', t.surfaces.join() === 'owner,guest')
  check('status shows the installed version', t.status === 'Installed · 2.0.1')
  check('surfaces may be an object or objects', tileFromManifest({ surfaces: { owner: {}, guest: {} } }, {}).surfaces.join() === 'owner,guest' &&
    tileFromManifest({ surfaces: [{ type: 'owner' }] }, {}).surfaces.join() === 'owner')
  check('with no manifest it falls back to the Store row', tileFromManifest(null, { id: 'x', name: 'Loyalty+', icon: '🎁', installed: {} }).name === 'Loyalty+')
  check('a name is always present', tileFromManifest({}, {}).name === 'App')
  const tiles = pipeline({
    entity: restaurantEntity,
    storeItems: [{ id: 'app-9', name: 'Tide Alerts', manifest, installed: { status: 'enabled', semver: '2.0.1' } }, { id: 'uninstalled', name: 'Nope', installed: null }],
  })
  check('an installed SDK app is a tile, an uninstalled one is not', ids(tiles).includes('sdk:app-9') && !ids(tiles).includes('sdk:uninstalled'))
  check('an icon URL is passed through untouched for Tile to decide', tileFromManifest({ name: 'X', icon: 'https://cdn.example/x.png' }, {}).icon === 'https://cdn.example/x.png')
}

console.log('\nOrder and hiding persist')
{
  const tiles = restaurantTiles
  const store = new Map()
  const storage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, v), removeItem: (k) => store.delete(k) }

  const defaults = applyLayout(tiles, EMPTY_LAYOUT)
  check('with nothing saved, the default order applies', ids(defaults.visible).join() === ids(tiles.filter((t) => !t.defaultHidden)).join())

  let layout = moveTile(tiles, EMPTY_LAYOUT, 'core:setup', -1)
  const afterMove = ids(applyLayout(tiles, layout).visible)
  const setupBefore = ids(defaults.visible).indexOf('core:setup')
  check('moving a tile earlier swaps it with its neighbour', afterMove.indexOf('core:setup') === setupBefore - 1)
  check('moving the first tile earlier does nothing',
    moveTile(tiles, EMPTY_LAYOUT, ids(defaults.visible)[0], -1) === EMPTY_LAYOUT)
  check('moving the last tile later does nothing',
    moveTile(tiles, EMPTY_LAYOUT, ids(defaults.visible).at(-1), 1) === EMPTY_LAYOUT)

  layout = hideTile(tiles, layout, 'data:photos')
  check('a hidden tile leaves the grid', !ids(applyLayout(tiles, layout).visible).includes('data:photos'))
  check('and waits on the shelf', ids(applyLayout(tiles, layout).hidden).includes('data:photos'))
  check('hiding keeps Platform hidden too', ids(applyLayout(tiles, layout).hidden).includes('core:platform'))

  check('saving works', saveLayout('harbor-grill', layout, storage) === true)
  const reloaded = loadLayout('harbor-grill', storage)
  check('a reload gives the same order', ids(applyLayout(tiles, reloaded).visible).join() === ids(applyLayout(tiles, layout).visible).join())
  check('a reload gives the same hidden set', ids(applyLayout(tiles, reloaded).hidden).join() === ids(applyLayout(tiles, layout).hidden).join())

  // Per business: an admin viewing as another business starts from its own layout.
  check('another business is unaffected', loadLayout('get-sideways', storage) === EMPTY_LAYOUT || loadLayout('get-sideways', storage).order.length === 0)

  const restored = showTile(tiles, reloaded, 'data:photos')
  check('showing a hidden tile puts it back at the end of the grid', ids(applyLayout(tiles, restored).visible).at(-1) === 'data:photos')
  check('it leaves the shelf', !ids(applyLayout(tiles, restored).hidden).includes('data:photos'))
  check('Platform can be brought out of its default-hidden state', ids(applyLayout(tiles, showTile(tiles, EMPTY_LAYOUT, 'core:platform')).visible).includes('core:platform'))

  // A layout never invents a tile.
  const stale = { order: ['app:gone', 'core:setup'], hidden: ['data:also-gone'] }
  const applied = applyLayout(tiles, stale)
  check('a stored id for a tile that no longer exists draws nothing',
    !ids(applied.visible).includes('app:gone') && !ids(applied.hidden).includes('data:also-gone'))
  check('a hidden tile that disappears does not hide its neighbours', ids(applied.visible).includes('data:hours'))

  // A newly installed app lands at the end instead of jumping the queue.
  const withNew = [...tiles, { id: 'sdk:new', kind: 'sdk', name: 'New', icon: '📦', target: { view: 'store' } }]
  check('a tile the layout has never seen goes after the ones it has', ids(applyLayout(withNew, layout).visible).at(-1) === 'sdk:new')

  clearLayout('harbor-grill', storage)
  check('reset forgets everything', ids(applyLayout(tiles, loadLayout('harbor-grill', storage)).visible).join() === ids(defaults.visible).join())

  // Hostile or broken storage never throws and never breaks the launcher.
  const broken = { getItem: () => '{not json', setItem: () => { throw new Error('quota') }, removeItem: () => { throw new Error('denied') } }
  check('corrupt JSON loads as the default', loadLayout('x', broken) === EMPTY_LAYOUT)
  check('a failed save reports false and does not throw', saveLayout('x', layout, broken) === false)
  check('a failed clear does not throw', (() => { try { clearLayout('x', broken); return true } catch { return false } })())
  check('wrong-shaped JSON loads as the default', (() => {
    const s = { getItem: () => JSON.stringify({ order: 'nope', hidden: [1, 2] }) }
    const l = loadLayout('x', s)
    return l.order.length === 0 && l.hidden === null
  })())
  check('no storage at all loads as the default and saves nothing', loadLayout('x', null) === EMPTY_LAYOUT && saveLayout('x', layout, null) === false)
  check('a storage whose getter throws is survivable', (() => {
    const s = { get getItem() { throw new Error('blocked') } }
    return loadLayout('x', s) === EMPTY_LAYOUT
  })())
}

console.log('\nThe view reducer knows the launcher')
{
  check('Setup is still the initial view (the landing swaps it once data is in)', INITIAL_VIEW === 'setup')
  check('home and app are views', VIEWS.includes('home') && VIEWS.includes('app'))
  check('home opens from anywhere', VIEWS.every((from) => viewReducer(from, { type: 'home' }) === 'home'))
  check('back from an app is the launcher', viewReducer('app', { type: 'back' }) === 'home')
  check('back elsewhere changes nothing', ['setup', 'section', 'add', 'store', 'home'].every((v) => viewReducer(v, { type: 'back' }) === v))
  check('an app opens from the launcher in one step', viewReducer('home', { type: 'show', view: 'app' }) === 'app')
}

console.log(failures ? `\n${failures} failed\n` : '\nAll checks passed\n')
process.exit(failures ? 1 : 0)
