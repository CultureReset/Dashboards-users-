// The owner's own profile: the `entity` row. Pure functions, no React, no network.
//
// GET /api/business/profile returns { profile, editable: [{ name, type, format }] }. The API decides which columns
// an owner may edit; nothing here names a column to allow. The patterns below only decide how a column is LABELLED,
// GROUPED and which INPUT it gets, so a column added to the schema tomorrow shows up tomorrow, under "Other" if no
// rule matches. PATCH takes only the fields that changed, and the slug is never part of it.

export const MAX_TEXT = 5000

const ACRONYMS = { url: 'URL', uri: 'URI', zip: 'ZIP', id: 'ID', wifi: 'Wi-Fi', ada: 'ADA', bbq: 'BBQ', tv: 'TV', ac: 'AC', qr: 'QR', sms: 'SMS', faq: 'FAQ', rv: 'RV', atm: 'ATM', gcr: 'GCR' }

/** `serves_beer` -> `Serves beer`, `menu_url` -> `Menu URL`, `wheelchair_accessible` -> `Wheelchair accessible`. */
export function humanize(name) {
  const words = String(name || '').replace(/([a-z])([A-Z])/g, '$1 $2').split(/[_\s-]+/).filter(Boolean)
  if (!words.length) return ''
  const out = words.map((w, i) => ACRONYMS[w.toLowerCase()] || (i === 0 ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w.toLowerCase()))
  return out.join(' ')
}

// Order matters: the first matching rule wins, and booleans that match nothing else become "features".
export const GROUPS = [
  { key: 'basics', label: 'About your business', test: (n) => /^(name|subtitle|tagline|description|short_description|about|bio|summary)$/.test(n) },
  { key: 'links', label: 'Links and social', test: (n) => /(_url|_link|_uri)$|^(website|url|link)$|(facebook|instagram|twitter|tiktok|youtube|yelp|linkedin|pinterest|social|handle)/.test(n) },
  { key: 'contact', label: 'Contact', test: (n) => /(phone|email|fax|contact|whatsapp)/.test(n) },
  { key: 'address', label: 'Address', test: (n) => /(address|street|city|state|zip|postal|country|county|neighborhood|latitude|longitude|^lat$|^lng$|^lon$|landmark|directions)/.test(n) },
  { key: 'hours', label: 'Hours and happy hour', test: (n) => /(happy_hour|hours|opens|closes|open_time|close_time|seasonal)/.test(n) },
  { key: 'policies', label: 'Policies', test: (n) => /(waiver|deposit|cancel|policy|policies|refund|terms|rules|age_limit|min_age|minimum_age)/.test(n) },
  { key: 'pricing', label: 'Pricing', test: (n) => /(price|pricing|cost|fee|rate|currency)/.test(n) },
  { key: 'features', label: 'Features and amenities', test: (n, c) => c.type === 'boolean' },
  { key: 'other', label: 'Other details', test: () => true },
]

export const groupOf = (col) => GROUPS.find((g) => g.test(col.name, col)).key

const LONG_TEXT = /(description|policy|policies|text|notes?|about|terms|bio|details|summary|instructions|rules|waiver|bullets|message)/

/** The control a column gets: boolean | integer | number | textarea | url | email | tel | date | time | text. */
export function kindOf(col) {
  if (col.type === 'boolean') return 'boolean'
  if (col.type === 'integer') return 'integer'
  if (col.type === 'number') return 'number'
  const n = col.name
  const f = String(col.format || '').toLowerCase()
  if (/^date$/.test(f)) return 'date'
  if (/^time\b/.test(f) && !/timestamp/.test(f)) return 'time'
  if (LONG_TEXT.test(n) && !/(_url|_link|phone|email)$/.test(n) && !/(url|link|phone|email)/.test(n)) return 'textarea'
  if (/(_url|_link)$|^(website|url)$/.test(n)) return 'url'
  if (/email/.test(n)) return 'email'
  if (/(phone|fax|whatsapp)/.test(n)) return 'tel'
  return 'text'
}

/** Editable columns bucketed into the ordered groups, empty groups dropped. */
export function groupColumns(editable) {
  const byKey = new Map(GROUPS.map((g) => [g.key, []]))
  for (const col of editable || []) byKey.get(groupOf(col)).push(col)
  return GROUPS.map((g) => ({ key: g.key, label: g.label, columns: byKey.get(g.key) })).filter((g) => g.columns.length)
}

/** Form state is all strings; booleans are 'true' | 'false' | '' (Not set). */
export function toForm(profile, editable) {
  const form = {}
  for (const col of editable || []) {
    const v = profile?.[col.name]
    form[col.name] = v === null || v === undefined ? '' : String(v)
  }
  return form
}

/** One field's string -> the value the API takes, or an error. Same rules as lib/businessProfile.js in the API. */
export function parseField(col, raw) {
  let s = String(raw ?? '')
  if (col.type !== 'boolean') s = s.trim()
  if (s === '') return { value: null }
  if (col.type === 'boolean') return s === 'true' || s === 'false' ? { value: s === 'true' } : { error: 'Choose Yes, No or Not set.' }
  if (col.type === 'number' || col.type === 'integer') {
    const n = Number(s)
    if (!Number.isFinite(n)) return { error: 'Must be a number.' }
    if (col.type === 'integer' && !Number.isInteger(n)) return { error: 'Must be a whole number.' }
    return { value: n }
  }
  if (s.length > MAX_TEXT) return { error: `Too long (limit ${MAX_TEXT} characters).` }
  return { value: s }
}

/**
 * What to PATCH: only the fields whose value differs from the loaded profile. `errors` blocks the save.
 * A field is compared as the API would store it, so " Hi " vs "Hi" or "" vs null is not a change.
 */
export function diffProfile(editable, profile, form) {
  const values = {}
  const errors = {}
  for (const col of editable || []) {
    if (!(col.name in form)) continue
    const next = parseField(col, form[col.name])
    if (next.error) { errors[col.name] = next.error; continue }
    const before = profile?.[col.name]
    const prev = before === undefined || before === '' ? null : before
    const same = col.type === 'number' || col.type === 'integer'
      ? (prev === null ? null : Number(prev)) === next.value
      : prev === next.value
    if (!same) values[col.name] = next.value
  }
  return { values, errors }
}

/** A 400 from PATCH carries `fields: { column: message }`; keep only text for columns we render. */
export function serverFieldErrors(body, editable) {
  const known = new Set((editable || []).map((c) => c.name))
  const shown = {}
  const other = []
  for (const [k, v] of Object.entries(body?.fields || {})) {
    if (known.has(k)) shown[k] = String(v)
    else other.push(`${humanize(k)}: ${v}`)
  }
  return { shown, other }
}

/** How a failed GET/PATCH reads to the owner. A 404 that is not "Business not found." means the route is not deployed. */
export function describeError(error) {
  if (!error) return ''
  if (!error.status) return { kind: 'network', text: 'Could not reach the server. Check your connection and try again.' }
  if (error.status === 404 && !/business not found/i.test(error.message || '')) {
    return { kind: 'missing', text: 'Profile editing is not available yet. It has not been switched on for this site, so nothing is wrong with your account. Please check back soon.' }
  }
  if (error.status === 404) return { kind: 'error', text: 'We could not find your business. Ask your administrator to check your account.' }
  if (error.status >= 500) return { kind: 'error', text: 'Something went wrong on our side. Your changes are still here; try again in a moment.' }
  return { kind: 'error', text: error.message || 'Something went wrong. Try again.' }
}
