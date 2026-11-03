// The owner's arrangement of the launcher: which tiles, in what order, which
// hidden. Kept per browser, per business, in localStorage.
//
// Per business because an admin using "View as" opens many businesses in one
// browser and must not rearrange one by editing another. Per browser because
// that is all localStorage is: a different phone starts from the default.
//
// A layout is only ever a *preference over tiles that exist*. It never makes a
// tile appear: a tile the business does not have (an uninstalled app, a table
// it may not see) is not drawn, whatever the stored layout says. That is what
// keeps a stale layout from resurrecting something.
//
// Pure functions plus load/save that take the storage as an argument, so the
// checks can run them under node with a fake one.

const KEY_PREFIX = 'nextgent_home_layout_v1:'

export const EMPTY_LAYOUT = Object.freeze({ order: [], hidden: null })

const isIds = (value) => Array.isArray(value) && value.every((v) => typeof v === 'string')

function defaultStorage() {
  try {
    return globalThis.localStorage || null
  } catch {
    return null // reading the property itself can throw when storage is blocked
  }
}

/** The saved layout for a business, or the empty one. Never throws. */
export function loadLayout(slug, storage = defaultStorage()) {
  try {
    const raw = storage?.getItem(KEY_PREFIX + slug)
    if (!raw) return EMPTY_LAYOUT
    const parsed = JSON.parse(raw)
    return {
      order: isIds(parsed?.order) ? parsed.order : [],
      hidden: isIds(parsed?.hidden) ? parsed.hidden : null,
    }
  } catch {
    return EMPTY_LAYOUT
  }
}

/** Save. Returns false (and the layout still applies this session) if storage refuses. */
export function saveLayout(slug, layout, storage = defaultStorage()) {
  try {
    if (!storage) return false
    storage.setItem(KEY_PREFIX + slug, JSON.stringify({ order: layout.order, hidden: layout.hidden }))
    return true
  } catch {
    return false
  }
}

export function clearLayout(slug, storage = defaultStorage()) {
  try {
    storage?.removeItem(KEY_PREFIX + slug)
  } catch {
    /* nothing to forget */
  }
}

/** Hidden ids in effect: the owner's choice, else each tile's own default. */
function hiddenIds(tiles, layout) {
  return new Set(layout.hidden ?? tiles.filter((t) => t.defaultHidden).map((t) => t.id))
}

/**
 * Split the tiles into what the grid draws and what is on the hidden shelf.
 * Saved order wins; tiles the layout has never seen (a freshly installed app)
 * follow, in their default order, like a new app landing at the end of a
 * home screen.
 */
export function applyLayout(tiles, layout = EMPTY_LAYOUT) {
  const hidden = hiddenIds(tiles, layout)
  const rank = new Map(layout.order.map((id, i) => [id, i]))
  const ordered = tiles
    .map((tile, i) => ({ tile, i }))
    .sort((a, b) => {
      const ra = rank.has(a.tile.id) ? rank.get(a.tile.id) : Infinity
      const rb = rank.has(b.tile.id) ? rank.get(b.tile.id) : Infinity
      return ra === rb ? a.i - b.i : ra - rb
    })
    .map((x) => x.tile)
  return {
    visible: ordered.filter((t) => !hidden.has(t.id)),
    hidden: ordered.filter((t) => hidden.has(t.id)),
  }
}

/** Move a tile one place earlier (-1) or later (+1) among the visible ones. */
export function moveTile(tiles, layout, id, delta) {
  const { visible, hidden } = applyLayout(tiles, layout)
  const ids = visible.map((t) => t.id)
  const from = ids.indexOf(id)
  const to = from + delta
  if (from < 0 || to < 0 || to >= ids.length) return layout
  ;[ids[from], ids[to]] = [ids[to], ids[from]]
  return {
    order: [...ids, ...hidden.map((t) => t.id)],
    hidden: layout.hidden ?? tiles.filter((t) => t.defaultHidden).map((t) => t.id),
  }
}

export function hideTile(tiles, layout, id) {
  const { visible, hidden } = applyLayout(tiles, layout)
  if (!visible.some((t) => t.id === id)) return layout
  return {
    order: [...visible.map((t) => t.id), ...hidden.map((t) => t.id)],
    hidden: [...hidden.map((t) => t.id), id],
  }
}

/** Bring a hidden tile back at the end of the grid. */
export function showTile(tiles, layout, id) {
  const { visible, hidden } = applyLayout(tiles, layout)
  if (!hidden.some((t) => t.id === id)) return layout
  const rest = hidden.filter((t) => t.id !== id)
  return {
    order: [...visible.map((t) => t.id), id, ...rest.map((t) => t.id)],
    hidden: rest.map((t) => t.id),
  }
}
