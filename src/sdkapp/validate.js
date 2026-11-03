// Everything the SDK renderer decides, as pure functions (no React, no network).
//
// scripts/check-sdkapp.mjs runs this file under node, so: no imports, explicit
// data in and out. The rules here MIRROR the API's (gcr-api-clean
// lib/appSdk/manifest.js checkValue + lib/businessTables.js coerceColumn) so an
// owner hears about a mistake before the round trip. The API stays the judge:
// anything it rejects with a 422 is shown under the same field (see
// explainServerMessage).
//
// A "field" is the shape GET /api/apps/<id> returns (and the manifest declares):
//   { key, label, type, required, default, help, placeholder, options,
//     max_length, min, max, ownerOnly }
// plus two keys the SDK does not define today and this file honours when
// present (forward compatibility, never required): `pattern` / `pattern_message`
// and `min_length`.

/** Every field type the API's manifest allows, plus the image-url the renderer can show. */
export const FIELD_TYPES = Object.freeze([
  'text', 'textarea', 'select', 'email', 'phone', 'url', 'image',
  'number', 'integer', 'money', 'boolean', 'date', 'timestamp', 'json',
])

/** Types a SETTING may have (lib/appSdk/manifest.js SETTING_TYPES). */
export const SETTING_TYPES = Object.freeze(['text', 'textarea', 'number', 'integer', 'boolean', 'select'])

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)
const isBlank = (v) => v === null || v === undefined || (typeof v === 'string' && v.trim() === '')

/** 'average_rating' -> 'Average rating' */
export function humanKey(key) {
  const s = String(key ?? '').replace(/[_-]+/g, ' ').trim()
  return s ? s[0].toUpperCase() + s.slice(1) : ''
}

/** A key that names an image, for a plain `url` field: a picture preview is worth showing. */
const IMAGE_KEY = /(^|_)(image|img|photo|picture|logo|avatar|thumbnail)(_url)?$/

/** What kind of control a field gets. */
export function inputKind(field) {
  switch (field?.type) {
    case 'textarea': return 'textarea'
    case 'select': return 'select'
    case 'email': return 'email'
    case 'phone': return 'tel'
    case 'image':
    case 'image_url': return 'image'
    case 'url': return IMAGE_KEY.test(String(field.key)) ? 'image' : 'url'
    case 'number': return 'number'
    case 'integer': return 'integer'
    case 'money': return 'money'
    case 'boolean': return 'checkbox'
    case 'date': return 'date'
    case 'timestamp': return 'datetime'
    case 'json': return 'json'
    default: return 'text'
  }
}

/** One field as the form reads it: label always present, options always { value, label }. */
export function normalizeField(f) {
  const field = isObj(f) ? f : {}
  const key = String(field.key ?? '')
  return {
    ...field,
    key,
    label: field.label || humanKey(key),
    type: field.type || 'text',
    required: field.required === true,
    ownerOnly: field.ownerOnly === true,
    options: normalizeOptions(field.options),
  }
}

/** Options may be strings or { value, label }. */
export function normalizeOptions(options) {
  if (!Array.isArray(options)) return null
  const out = options
    .map((o) => (isObj(o) ? { value: String(o.value), label: String(o.label ?? o.value) } : { value: String(o), label: humanKey(o) || String(o) }))
    .filter((o) => o.value !== '')
  return out.length ? out : null
}

/* ── raw form value <-> typed value ───────────────────────────────────── */

const pad = (n) => String(n).padStart(2, '0')

/** ISO timestamp -> the value a datetime-local input wants (the viewer's own time zone). */
export function timestampToInput(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** datetime-local value -> ISO timestamp, or null when it is not a real moment. */
export function inputToTimestamp(local) {
  if (!local) return null
  const d = new Date(local)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

/** A stored value as the form holds it: text for every input, a real boolean for a switch. */
export function toFormValue(field, value) {
  const kind = inputKind(field)
  if (kind === 'checkbox') return value === true
  if (value === null || value === undefined) return ''
  if (kind === 'datetime') return timestampToInput(value)
  if (kind === 'json') return typeof value === 'string' ? value : JSON.stringify(value, null, 2)
  if (kind === 'date') return String(value).slice(0, 10)
  return String(value)
}

/** The empty form for "Add": every field at its declared default. */
export function formDefaults(fields) {
  const out = {}
  for (const raw of fields || []) {
    const f = normalizeField(raw)
    out[f.key] = toFormValue(f, f.default ?? null)
  }
  return out
}

/** The form for "Edit": every field at the row's value. */
export function formFromRow(fields, row) {
  const out = {}
  for (const raw of fields || []) {
    const f = normalizeField(raw)
    out[f.key] = toFormValue(f, row ? row[f.key] : null)
  }
  return out
}

/* ── validation ───────────────────────────────────────────────────────── */

const EMAIL = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/
const URL_RE = /^https?:\/\/\S+$/i

function realDate(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false
  const [y, m, d] = s.split('-').map(Number)
  const t = new Date(Date.UTC(y, m - 1, d))
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d
}

function parseNumber(s, { money = false } = {}) {
  let t = String(s).trim()
  if (money) t = t.replace(/^\$/, '').replace(/,/g, '')
  if (t === '' || !/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(t)) return null
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

function rangeMessage(f) {
  const hasMin = typeof f.min === 'number'
  const hasMax = typeof f.max === 'number'
  if (hasMin && hasMax) return `Enter a number from ${f.min} to ${f.max}.`
  if (hasMin) return `Enter ${f.min} or more.`
  return `Enter ${f.max} or less.`
}

/**
 * Check one field's raw form value.
 * @returns {{ value: any, error: string|null }} `value` is typed (null when left empty);
 *   `error` is a sentence for the owner, shown under the input.
 */
export function validateField(rawField, raw) {
  const f = normalizeField(rawField)
  const kind = inputKind(f)

  if (kind === 'checkbox') return { value: raw === true || raw === 'true', error: null }

  if (isBlank(raw)) {
    if (f.required) return { value: null, error: kind === 'select' ? 'Please choose one.' : 'Please fill this in.' }
    return { value: null, error: null }
  }
  const text = String(raw)

  switch (kind) {
    case 'select': {
      const ok = f.options ? f.options.some((o) => o.value === text) : true
      return ok ? { value: text, error: null } : { value: null, error: 'Please choose one of the options.' }
    }
    case 'integer':
    case 'number':
    case 'money': {
      const n = parseNumber(text, { money: kind === 'money' })
      if (n === null) {
        const msg = kind === 'integer' ? 'Enter a whole number, like 3.' : kind === 'money' ? 'Enter an amount, like 12.50.' : 'Enter a number, like 12.5.'
        return { value: null, error: msg }
      }
      if (kind === 'integer' && !Number.isInteger(n)) return { value: null, error: 'Enter a whole number, like 3.' }
      if (kind === 'money' && Math.round(n * 100) / 100 !== n) return { value: null, error: 'Use dollars and cents, like 12.50.' }
      if ((typeof f.min === 'number' && n < f.min) || (typeof f.max === 'number' && n > f.max)) return { value: null, error: rangeMessage(f) }
      return { value: n, error: null }
    }
    case 'date':
      return realDate(text) ? { value: text, error: null } : { value: null, error: 'Pick a date.' }
    case 'datetime': {
      const iso = inputToTimestamp(text)
      return iso ? { value: iso, error: null } : { value: null, error: 'Pick a date and a time.' }
    }
    case 'json': {
      try {
        return { value: JSON.parse(text), error: null }
      } catch {
        return { value: null, error: "That isn't valid JSON. Check for a missing quote, comma or bracket." }
      }
    }
    default:
      break
  }

  // Text-like: text, textarea, email, tel, url, image
  const value = text.trim()
  if (kind === 'email' && !EMAIL.test(value)) return { value: null, error: 'Enter an email address, like name@example.com.' }
  if ((kind === 'url' || kind === 'image') && !URL_RE.test(value)) {
    return { value: null, error: kind === 'image' ? 'Enter the web address of a picture, starting with http:// or https://.' : 'Enter a web address starting with http:// or https://.' }
  }
  if (kind === 'tel') {
    const digits = value.replace(/\D/g, '')
    if (!/^[\d\s().+\-x#]+$/i.test(value) || digits.length < 7 || digits.length > 15) {
      return { value: null, error: 'Enter a phone number with at least 7 digits, like (555) 123-4567.' }
    }
  }
  if (Number.isInteger(f.min_length) && value.length < f.min_length) {
    return { value: null, error: `Please write at least ${f.min_length} characters (it's ${value.length} now).` }
  }
  if (Number.isInteger(f.max_length) && value.length > f.max_length) {
    return { value: null, error: `Please keep this to ${f.max_length} characters or fewer (it's ${value.length} now).` }
  }
  if (typeof f.pattern === 'string' && f.pattern) {
    let re = null
    try { re = new RegExp(f.pattern) } catch { re = null }
    if (re && !re.test(value)) return { value: null, error: f.pattern_message || "That doesn't look right." }
  }
  return { value, error: null }
}

/** Typed values equal? (used to send only what changed) */
export function sameValue(a, b) {
  if (a === b) return true
  if ((a === null || a === undefined || a === '') && (b === null || b === undefined || b === '')) return true
  if (isObj(a) || isObj(b) || Array.isArray(a) || Array.isArray(b)) {
    try { return JSON.stringify(a) === JSON.stringify(b) } catch { return false }
  }
  if (typeof a === 'string' && typeof b === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(a) && /^\d{4}-\d{2}-\d{2}T/.test(b)) {
    return new Date(a).getTime() === new Date(b).getTime()
  }
  return false
}

/**
 * Check a whole form.
 * mode 'create'  -> empty optional fields are left out so the API fills the declared default
 *                   (sending null would override it). Booleans are always sent.
 * mode 'edit'    -> only the fields that changed (PATCH semantics); a cleared field is sent as null.
 * @returns {{ ok: boolean, values: object, errors: Record<string,string>, changed: boolean }}
 */
export function collectForm(fields, form, { mode = 'create', row = null } = {}) {
  const values = {}
  const errors = {}
  let changed = false
  for (const raw of fields || []) {
    const f = normalizeField(raw)
    const { value, error } = validateField(f, form?.[f.key])
    if (error) { errors[f.key] = error; continue }
    if (mode === 'edit') {
      const before = row ? row[f.key] : null
      if (!sameValue(value, before)) { values[f.key] = value; changed = true }
    } else if (inputKind(f) === 'checkbox' || value !== null) {
      values[f.key] = value
      changed = true
    }
  }
  return { ok: Object.keys(errors).length === 0, values, errors, changed }
}

/** First field key (in declared order) that has an error: where focus goes. */
export function firstErrorKey(fields, errors) {
  for (const f of fields || []) if (errors && errors[f.key]) return f.key
  return Object.keys(errors || {})[0] || null
}

/** "3 things need attention: Name (Please fill this in.), ..." for a screen reader. */
export function errorSummary(fields, errors) {
  const parts = []
  for (const raw of fields || []) {
    const f = normalizeField(raw)
    if (errors?.[f.key]) parts.push(`${f.label}: ${errors[f.key]}`)
  }
  if (!parts.length) return ''
  return `${parts.length === 1 ? '1 thing needs' : `${parts.length} things need`} attention. ${parts.join(' ')}`
}

/**
 * The API answers 422 { errors: { key: "must be a whole number." } } — a
 * fragment that expects its field name in front. Turn it into a sentence that
 * stands alone under the input.
 */
export function explainServerMessage(message) {
  const m = String(message || '').trim()
  if (!m) return 'Something is wrong with this.'
  const sentence = /^(is|must|has)\b/i.test(m) ? `This ${m}` : m
  const cap = sentence[0].toUpperCase() + sentence.slice(1)
  return /[.!?]$/.test(cap) ? cap : `${cap}.`
}

/** Server `errors` map -> { key: sentence }. Keys the form does not show are kept (under `_form`). */
export function explainServerErrors(errors, fields) {
  const known = new Set((fields || []).map((f) => f.key))
  const out = {}
  const stray = []
  for (const [key, msg] of Object.entries(isObj(errors) ? errors : {})) {
    if (known.has(key)) out[key] = explainServerMessage(msg)
    else stray.push(`${humanKey(key)}: ${explainServerMessage(msg)}`)
  }
  if (stray.length) out._form = stray.join(' ')
  return out
}

/* ── settings ─────────────────────────────────────────────────────────── */

/** settings.values -> the form's state. A null value shows as empty. */
export function settingsToForm(schema, values) {
  const out = {}
  for (const raw of schema || []) {
    const f = normalizeField(raw)
    const v = values && f.key in values ? values[f.key] : f.default ?? null
    out[f.key] = toFormValue(f, v)
  }
  return out
}

/** The PATCH body: only the settings that changed. */
export function settingsPatch(schema, form, values) {
  return collectForm(schema, form, { mode: 'edit', row: values || {} })
}

/** What the settings look like once the API has applied a patch (for the optimistic round trip check). */
export function applySettingsPatch(values, patch) {
  return { ...values, ...patch }
}

/* ── lists: columns, cells, sort, filter, pages ───────────────────────── */

/** The resource's title field first, then the others in declared order. json is not a column. */
export function listColumns(resource) {
  const fields = (resource?.fields || []).map(normalizeField)
  const titleKey = resource?.title || fields[0]?.key
  const title = fields.find((f) => f.key === titleKey) || fields[0]
  const rest = fields.filter((f) => f !== title && inputKind(f) !== 'json')
  return title ? [title, ...rest] : rest
}

const COMPACT = new Set(['number', 'integer', 'money', 'select', 'checkbox', 'date', 'datetime'])

/** A column heading: the label without a trailing "(optional)" or "?". */
export function shortLabel(label) {
  return String(label || '').replace(/\s*\((optional|required)\)\s*$/i, '').trim()
}

/**
 * The columns of the desktop table: the title, then at most `max - 1` others,
 * preferring compact ones (numbers, choices, yes/no, dates) over free text, in
 * declared order. The rest are one tap away in Edit, and the phone's cards show them.
 */
export function tableColumns(resource, max = 4) {
  const [title, ...rest] = listColumns(resource)
  if (!title) return []
  const room = Math.max(0, max - 1)
  const keep = new Set([...rest.filter((f) => COMPACT.has(inputKind(f))), ...rest.filter((f) => !COMPACT.has(inputKind(f)))].slice(0, room).map((f) => f.key))
  return [title, ...rest.filter((f) => keep.has(f.key))]
}

/** The label of the thing a row is: its title field, else "Entry". */
export function rowTitle(resource, row) {
  const t = resource?.title || resource?.fields?.[0]?.key
  const v = row && t ? row[t] : null
  if (isBlank(v)) return 'Untitled entry'
  const s = String(v).replace(/\s+/g, ' ').trim()
  return s.length > 80 ? `${s.slice(0, 77)}...` : s
}

/** One cell as text. */
export function formatCell(rawField, value, { locale } = {}) {
  const f = normalizeField(rawField)
  if (value === null || value === undefined || value === '') return inputKind(f) === 'checkbox' ? 'No' : '—'
  switch (inputKind(f)) {
    case 'checkbox': return value ? 'Yes' : 'No'
    case 'date': {
      const [y, m, d] = String(value).slice(0, 10).split('-').map(Number)
      if (!y) return String(value)
      return new Date(y, m - 1, d).toLocaleDateString(locale, { year: 'numeric', month: 'short', day: 'numeric' })
    }
    case 'datetime': {
      const d = new Date(value)
      return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleString(locale, { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
    }
    case 'money': return typeof value === 'number' ? value.toLocaleString(locale, { style: 'currency', currency: 'USD' }) : String(value)
    case 'select': return f.options?.find((o) => o.value === String(value))?.label || String(value)
    case 'json': {
      const s = typeof value === 'string' ? value : JSON.stringify(value)
      return s.length > 60 ? `${s.slice(0, 57)}...` : s
    }
    case 'url':
    case 'image': return String(value).replace(/^https?:\/\//i, '').replace(/\/$/, '')
    default: {
      const s = String(value).replace(/\s+/g, ' ').trim()
      return s.length > 140 ? `${s.slice(0, 137)}...` : s
    }
  }
}

/** Added/updated stamp, short. */
export function formatStamp(iso, { locale } = {}) {
  const d = new Date(iso)
  if (!iso || Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString(locale, { month: 'short', day: 'numeric', year: 'numeric' })
}

/** Which fields a list can sort by (everything but json), as { key, label }. */
export function sortOptions(resource) {
  return [
    { key: '_created', label: 'Newest first' },
    ...listColumns(resource).map((f) => ({ key: f.key, label: f.label })),
  ]
}

/** Fields that get a dropdown filter: selects and yes/no switches. */
export function filterFields(resource) {
  return (resource?.fields || []).map(normalizeField).filter((f) => {
    const k = inputKind(f)
    return k === 'select' || k === 'checkbox'
  })
}

function compare(f, a, b) {
  const k = inputKind(f)
  if (k === 'number' || k === 'integer' || k === 'money') return Number(a) - Number(b)
  if (k === 'checkbox') return Number(!!a) - Number(!!b)
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' })
}

/**
 * Sort and filter the rows that are loaded.
 * @param {object[]} rows
 * @param {object} resource
 * @param {{ sortKey?: string, dir?: 'asc'|'desc', filters?: Record<string,string>, query?: string }} view
 */
export function applyView(rows, resource, { sortKey = '_created', dir = 'desc', filters = {}, query = '' } = {}) {
  const fields = (resource?.fields || []).map(normalizeField)
  const q = String(query || '').trim().toLowerCase()
  let out = (rows || []).filter((row) => {
    for (const [key, want] of Object.entries(filters || {})) {
      if (want === '' || want === undefined || want === null) continue
      const f = fields.find((x) => x.key === key)
      const have = f && inputKind(f) === 'checkbox' ? String(row[key] === true) : String(row[key] ?? '')
      if (have !== String(want)) return false
    }
    if (q) {
      const hay = fields
        .filter((f) => ['text', 'textarea', 'email', 'tel', 'url', 'image', 'select'].includes(inputKind(f)))
        .map((f) => String(row[f.key] ?? '')).join(' ').toLowerCase()
      if (!hay.includes(q)) return false
    }
    return true
  })
  if (sortKey && sortKey !== '_created') {
    const f = fields.find((x) => x.key === sortKey)
    if (f) {
      const sign = dir === 'asc' ? 1 : -1
      out = [...out].sort((a, b) => {
        const blankA = isBlank(a[sortKey])
        const blankB = isBlank(b[sortKey])
        if (blankA || blankB) return blankA === blankB ? 0 : blankA ? 1 : -1 // blanks last, whichever way it sorts
        return sign * compare(f, a[sortKey], b[sortKey]) || 0
      })
    }
  } else if (dir === 'asc') {
    out = [...out].reverse() // the API sends newest first
  }
  return out
}

/** "Showing 26-50 of 140" and the offsets for Previous / Next. */
export function pageInfo({ total = 0, limit = 50, offset = 0, count = 0 } = {}) {
  const lim = Math.max(1, Number(limit) || 50)
  const off = Math.max(0, Number(offset) || 0)
  const n = Math.max(0, Number(count) || 0)
  const t = Math.max(Number(total) || 0, off + n)
  return {
    total: t,
    from: n ? off + 1 : 0,
    to: off + n,
    hasPrev: off > 0,
    hasNext: off + n < t,
    prevOffset: Math.max(0, off - lim),
    nextOffset: off + lim,
    pages: Math.max(1, Math.ceil(t / lim)),
    page: Math.floor(off / lim) + 1,
    partial: t > n, // the loaded rows are not all of them: sort and filter see this page only
  }
}

/* ── the descriptor ───────────────────────────────────────────────────── */

const ACCESS_OF_KIND = { read: 'read', create: 'write', update: 'write' }

/**
 * Accept what GET /api/apps/<id> returns (the descriptor) OR a bare SDK
 * manifest, and give back one shape. This is how the renderer works "from the
 * manifest alone": given a manifest and an install id it can draw everything
 * but the live values and counts.
 */
export function normalizeApp(input, { installId = null, granted = null, values = null } = {}) {
  const src = isObj(input) ? input : {}
  const isDescriptor = isObj(src.app) && ('resources' in src || 'settings' in src || 'installed' in src)
  const m = isDescriptor ? src.app : src

  const resources = (src.resources || []).map((r) => {
    const fields = (r.fields || []).map(normalizeField)
    return {
      id: r.id,
      label: r.label || humanKey(r.id),
      description: r.description || null,
      title: r.title || fields[0]?.key || null,
      public: r.public || 'none',
      fields,
      count: typeof r.count === 'number' ? r.count : null,
    }
  })
  const byId = new Map(resources.map((r) => [r.id, r]))

  const settingsSchema = ((isDescriptor ? src.settings?.schema : src.settings) || []).map((s) => normalizeField(s))
  const settingsValues = isDescriptor ? src.settings?.values ?? null : values

  const actions = (src.actions || []).map((a) => {
    const kind = a.kind || 'handler'
    let input = a.input
    if (!isDescriptor) {
      input = kind === 'create' || kind === 'update' ? byId.get(a.resource)?.fields || [] : kind === 'read' ? [] : a.input || []
    }
    const fields = (input || []).map(normalizeField)
    const resource = a.resource || (kind === 'create' || kind === 'update' ? resourceMatching(resources, fields) : null)
    return {
      id: a.id,
      label: a.label || humanKey(a.id),
      summary: a.summary || '',
      kind,
      access: a.access || ACCESS_OF_KIND[kind] || 'write',
      input: fields,
      resource,
    }
  })

  const requested = isDescriptor
    ? src.permissions?.requested || []
    : (src.permissions || []).map((p) => (typeof p === 'string' ? p : p?.id)).filter(Boolean)
  const grantedList = isDescriptor ? src.permissions?.granted || [] : granted

  const publicSurfaces = (src.surfaces || []).filter((s) => s.kind === 'public')
  const publicResources = resources.filter((r) => r.public && r.public !== 'none')
  const effectiveInstall = isDescriptor ? src.installed?.installId || installId : installId
  const publicInfo = isDescriptor
    ? src.public || null
    : effectiveInstall && (publicSurfaces.length || publicResources.length)
      ? { path: `/api/apps/${m.id}/public/${effectiveInstall}`, surfaces: publicSurfaces, resources: publicResources.map((r) => r.id) }
      : null

  return {
    id: m.id,
    name: m.name || humanKey(m.id) || 'App',
    summary: m.summary || '',
    description: m.description || null,
    icon: m.icon || null,
    category: m.category || null,
    version: m.version || null,
    installed: isDescriptor ? src.installed || null : effectiveInstall ? { installId: effectiveInstall, version: null } : null,
    permissions: { requested, granted: grantedList },
    settings: { schema: settingsSchema, values: settingsValues },
    resources,
    actions,
    events: src.events || [],
    surfaces: src.surfaces || [],
    public: publicInfo,
  }
}

/** A create/update action's resource: the descriptor does not name it, but its input is that resource's fields. */
function resourceMatching(resources, fields) {
  const keys = fields.map((f) => f.key).join(',')
  return resources.find((r) => r.fields.map((f) => f.key).join(',') === keys)?.id || null
}

/* ── actions ──────────────────────────────────────────────────────────── */

const DESTRUCTIVE = /\b(delete|remove|erase|clear|purge|reset|cancel|wipe|discard|destroy|empty)\b/i
const messagesAllowed = (app) => (app?.permissions?.requested || []).includes('messages:send')
  && (app?.permissions?.granted == null || (app.permissions.granted || []).includes('messages:send'))

/** Does running this action possibly text or email customers? A handler with write access, in an app that may send. */
export function sendsMessages(action, app) {
  return action?.kind === 'handler' && action.access === 'write' && messagesAllowed(app)
}

export function isDestructive(action) {
  return DESTRUCTIVE.test(`${action?.id || ''} ${action?.label || ''} ${action?.summary || ''}`)
}

/**
 * What the button does and whether to ask first.
 *   mode 'run'      call POST /api/apps/<id>/actions/<action>
 *   mode 'add'      same as the resource's Add form (create actions)
 *   mode 'info'     no button: an update action is the Edit form on each row
 * The confirm rule: anything that changes data, sends messages or is
 * destructive is confirmed, in words that say what will happen. A plain read
 * is not.
 */
export function actionPlan(action, app) {
  const a = action || {}
  if (a.kind === 'create' && a.resource) return { mode: 'add', resource: a.resource, confirm: { needed: false } }
  if (a.kind === 'update') return { mode: 'info', resource: a.resource || null, confirm: { needed: false } }

  const sends = sendsMessages(a, app)
  const destructive = isDestructive(a)
  const writes = a.access === 'write'
  const needed = writes || sends || destructive
  const lines = []
  if (a.summary) lines.push(a.summary.replace(/\s+$/, ''))
  if (sends) lines.push('This may send text messages or emails to your customers.')
  else if (writes) lines.push('This changes information in your business.')
  if (destructive) lines.push("This can't be undone.")
  return {
    mode: 'run',
    needsInput: (a.input || []).length > 0,
    confirm: {
      needed,
      danger: destructive,
      sends,
      title: `${destructive ? 'Are you sure? ' : ''}${a.label || humanKey(a.id)}?`.replace(/\?\?$/, '?'),
      message: lines.join(' '),
      confirmLabel: a.label || 'Run',
    },
  }
}

/** The request body for a run: declared input only. */
export function actionBody(action, form) {
  return collectForm(action?.input || [], form, { mode: 'create' })
}

/** Anything an action returned, in words. */
export function summarizeResult(result) {
  if (result === null || result === undefined) return { headline: 'Done.', items: [] }
  if (typeof result !== 'object') return { headline: String(result), items: [] }
  if (Array.isArray(result)) return { headline: `${result.length} ${result.length === 1 ? 'result' : 'results'}.`, items: [] }
  if (Array.isArray(result.rows)) {
    const total = typeof result.total === 'number' ? result.total : result.rows.length
    return { headline: `Found ${total} ${total === 1 ? 'entry' : 'entries'}.`, items: [] }
  }
  if (isObj(result.created) || isObj(result.updated)) return { headline: result.created ? 'Added.' : 'Saved.', items: [] }
  const items = []
  let headline = ''
  for (const [k, v] of Object.entries(result)) {
    if (k === 'ok' && v === true && Object.keys(result).length === 1) headline = 'Done.'
    else if ((k === 'message' || k === 'summary') && typeof v === 'string') headline = v
    else if (v === null || v === undefined) items.push({ label: humanKey(k), value: '—' })
    else if (typeof v === 'boolean') items.push({ label: humanKey(k), value: v ? 'Yes' : 'No' })
    else if (typeof v === 'number') items.push({ label: humanKey(k), value: Number.isInteger(v) ? String(v) : String(Math.round(v * 100) / 100) })
    else if (typeof v === 'string') items.push({ label: humanKey(k), value: v })
    else items.push({ label: humanKey(k), value: JSON.stringify(v) })
  }
  return { headline: headline || (items.length ? 'Done. Here is what came back:' : 'Done.'), items }
}

/* ── permissions in plain words ───────────────────────────────────────── */

const KNOWN_PERMISSIONS = {
  'messages:send': 'Send text messages and emails to your customers',
  'connections:read': "See which tools you have connected (like Gmail), never your passwords",
  public_page: 'Show a public page for your business',
  collect_submissions: 'Collect entries from your customers',
  store_records: 'Keep its own list of records for your business',
  owner_settings: 'Keep settings that you choose',
}

/** One permission id as a sentence. */
export function describePermission(id) {
  const p = String(id || '')
  if (KNOWN_PERMISSIONS[p]) return KNOWN_PERMISSIONS[p]
  const m = /^([a-z_]+):(read|write|send)$/.exec(p)
  if (m) {
    const what = m[1].replace(/_/g, ' ')
    return m[2] === 'read' ? `Read your ${what}` : m[2] === 'write' ? `Change your ${what}` : `Send ${what}`
  }
  return humanKey(p)
}

/**
 * What the app reads, writes and sends, from its manifest and what the owner
 * allowed. Groups are lists of sentences; an empty group is simply absent.
 */
export function permissionSummary(app) {
  const requested = app?.permissions?.requested || []
  const granted = app?.permissions?.granted
  const reads = []
  const writes = []
  const sends = []
  const visitors = []
  for (const r of app?.resources || []) {
    const name = r.label.toLowerCase()
    reads.push(`Its own ${name} list`)
    writes.push(`Adds and changes entries in its ${name} list`)
    if (r.public === 'append' || r.public === 'read-append') visitors.push(`Customers can add to ${name} through your public link${r.public === 'append' ? '; only you can read it' : ''}`)
    if (r.public === 'read' || r.public === 'read-append') visitors.push(`Customers can read your ${name} on the public page`)
  }
  if ((app?.settings?.schema || []).length) writes.push('Keeps the settings you choose below')
  for (const id of requested) {
    if (id === 'messages:send') sends.push(KNOWN_PERMISSIONS[id])
    else if (id === 'connections:read') reads.push(KNOWN_PERMISSIONS[id])
    else if (id.endsWith(':read')) reads.push(describePermission(id))
    else if (id.endsWith(':write')) writes.push(describePermission(id))
  }
  const asked = requested.map((id) => ({
    id,
    text: describePermission(id),
    // Unknown (a bare manifest): shown as asked, not as allowed.
    granted: Array.isArray(granted) ? granted.includes(id) : null,
  }))
  return { reads: [...new Set(reads)], writes: [...new Set(writes)], sends, visitors, asked }
}

/* ── the public link ──────────────────────────────────────────────────── */

/** `<API origin><public.path>` — what docs/APP-SDK.md says to show. */
export function publicUrl(base, app) {
  const path = app?.public?.path
  if (!path) return null
  return `${String(base || '').replace(/\/+$/, '')}${path}`
}

/* ── errors in plain words ────────────────────────────────────────────── */

/**
 * A failed call, as a sentence for a toast or a banner. `kind` is
 * api.classifyError(...).kind; `apiMessage` the API's own sentence (shown only
 * for kinds where it is written for the owner); `doing` finishes "Couldn't ___".
 */
export function friendlyMessage(kind, apiMessage = '', doing = 'do that') {
  switch (kind) {
    case 'offline': return "You're offline, so that didn't go through. Check your connection and try again."
    case 'not_configured': return "This app can't keep information yet. It needs a one-time setup on the platform first. Nothing is wrong with your business."
    case 'not_installed': return 'This app was removed from your business, so that did not go through.'
    case 'forbidden': return "Your account can't use this app right now."
    case 'signed_out': return 'Your session ended. Please sign in again.'
    case 'invalid': return apiMessage || 'Some details need attention.'
    case 'not_found': return apiMessage || 'That is no longer there. It may have been removed.'
    default: return apiMessage ? `Couldn't ${doing}: ${apiMessage}` : `Couldn't ${doing}. Please try again.`
  }
}
