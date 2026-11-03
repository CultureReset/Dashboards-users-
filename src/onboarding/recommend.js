// Which apps and tools to suggest for which kind of business.
//
// This is a nudge, not an entitlement: the store (GET /api/store) decides what
// a business may install, and nothing here installs anything. Keys are store
// item keys. A key the store does not offer to this business is ignored.

export const MAX_RECOMMENDED = 3
export const MAX_TOOLS = 6

const BOTH = ['song-request', 'merch-store']

// Industry value (as stored in entity.entity_type) -> recommended store keys.
const INDUSTRY_APPS = {
  artist: BOTH,
  music: BOTH,
  entertainment: BOTH,
  restaurant: ['merch-store'],
  coffee: ['merch-store'],
  shopping: ['merch-store'],
  activity: ['merch-store'],
  service: ['merch-store'],
}

// Words in an industry value that mean one of the groups above, so
// "live-music-venue" or "dj" still get sensible suggestions.
const INDUSTRY_ALIASES = [
  [/artist|music|band|\bdj\b|perform|entertain/, 'artist'],
  [/restaurant|food|bar\b|grill|pub/, 'restaurant'],
  [/coffee|caf[eé]|bakery|dessert/, 'coffee'],
  [/shop|retail|store|boutique/, 'shopping'],
  [/charter|tour|activity|rental|cruise|watersport/, 'activity'],
  [/service|salon|repair|trade/, 'service'],
]

export function normalizeIndustry(value) {
  const raw = String(value ?? '').trim().toLowerCase()
  if (!raw) return ''
  if (INDUSTRY_APPS[raw]) return raw
  for (const [pattern, group] of INDUSTRY_ALIASES) if (pattern.test(raw)) return group
  return raw
}

/** What a business can install right now: not installed, allowed, with a version. */
export function isInstallable(item) {
  return !!item && !item.installed && !!item.entitled && !!item.available
}

/**
 * Ids of the apps to switch on by default. Recommended keys first (only those
 * the business can actually install); otherwise the first free apps. Never more
 * than MAX_RECOMMENDED, and never a paid or plan-only app by fallback.
 */
export function recommendApps(items, industry) {
  const list = (Array.isArray(items) ? items : []).filter(isInstallable)
  const wanted = INDUSTRY_APPS[normalizeIndustry(industry)] || []
  const matched = wanted
    .map((key) => list.find((item) => item.key === key))
    .filter(Boolean)
  const chosen = matched.length ? matched : list.filter((item) => item.reason === 'free')
  return chosen.slice(0, MAX_RECOMMENDED).map((item) => item.id)
}

// Words that make a tool relevant, most useful first. Matched against the
// tool's id, name and category.
const COMMON_TOOL_WORDS = ['calendar', 'email', 'gmail', 'sheet', 'payment', 'stripe', 'square', 'sms', 'message']
const INDUSTRY_TOOL_WORDS = {
  restaurant: ['square', 'payment', 'instagram', 'facebook', 'calendar'],
  coffee: ['square', 'payment', 'instagram', 'facebook'],
  shopping: ['shopify', 'stripe', 'square', 'payment', 'instagram'],
  activity: ['calendar', 'google', 'stripe', 'email', 'facebook'],
  artist: ['instagram', 'spotify', 'youtube', 'facebook', 'calendar'],
}

/** The most relevant tools for this business, at most `limit`, order kept stable. */
export function pickTools(tools, industry, limit = MAX_TOOLS) {
  const list = Array.isArray(tools) ? tools.filter((tool) => tool && tool.tool_id) : []
  const words = [...(INDUSTRY_TOOL_WORDS[normalizeIndustry(industry)] || []), ...COMMON_TOOL_WORDS]
  const score = (tool) => {
    const text = `${tool.tool_id} ${tool.name || ''} ${tool.cat || ''}`.toLowerCase()
    const index = words.findIndex((word) => text.includes(word))
    return index === -1 ? 0 : words.length - index
  }
  return list
    .map((tool, position) => ({ tool, position, score: score(tool) }))
    .sort((a, b) => b.score - a.score || a.position - b.position)
    .slice(0, limit)
    .map(({ tool }) => tool)
}
