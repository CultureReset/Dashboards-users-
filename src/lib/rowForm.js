// Turning a table's live columns into form fields and back.
//
// The edit form builds itself from GET /api/business/schema, which describes a
// column by { type, format }. PostgREST reports a text[] as type "array" and a
// jsonb column as format "jsonb". Both used to fall through to a plain text
// input, which showed "[object Object]" for jsonb and sent that string back —
// so saving any row with a jsonb column (a rental's amenities, an artist's
// songs) overwrote the real data with the text "[object Object]".
//
// Pure functions, no React, so scripts/check-discovery.mjs can test them.

const NUMERIC_ITEM = /^(int|integer|bigint|smallint|numeric|decimal|real|float|double)/i

/** 'array' | 'json' | 'boolean' | 'integer' | 'number' | 'text' */
export function kindOf(col) {
  const format = String(col?.format || '')
  if (col?.type === 'array' || format.endsWith('[]') || format.startsWith('_')) return 'array'
  if (/^jsonb?$/i.test(format) || col?.type === 'object') return 'json'
  if (col?.type === 'boolean') return 'boolean'
  if (col?.type === 'integer') return 'integer'
  if (col?.type === 'number') return 'number'
  return 'text'
}

const isPlainList = (v) => Array.isArray(v) && v.every((x) => x === null || typeof x !== 'object')

/** The form's string for a stored value. */
export function toField(col, value) {
  if (value === null || value === undefined) return ''
  const kind = kindOf(col)
  if (kind === 'array') {
    // A list of plain values is one per line. A list of objects is JSON.
    if (isPlainList(value)) return value.map((x) => (x === null ? '' : String(x))).join('\n')
    return JSON.stringify(value, null, 2)
  }
  if (kind === 'json') return typeof value === 'string' ? value : JSON.stringify(value, null, 2)
  if (kind === 'boolean') return String(value)
  return value
}

/** Does the editor show this field as a multi-line box? */
export function isMultiline(col) {
  const kind = kindOf(col)
  return kind === 'array' || kind === 'json'
}

/**
 * The stored value for a form string. Returns { value } or { error }.
 * An empty field is null — "no value", never an empty string.
 */
export function fromField(col, raw) {
  const label = col.name.replace(/_/g, ' ')
  if (raw === '' || raw === undefined || raw === null) return { value: null }
  const kind = kindOf(col)
  const text = typeof raw === 'string' ? raw : String(raw)

  if (kind === 'boolean') return { value: text === 'true' }

  if (kind === 'integer' || kind === 'number') {
    const n = Number(text)
    if (!Number.isFinite(n)) return { error: `${label} must be a number.` }
    if (kind === 'integer' && !Number.isInteger(n)) return { error: `${label} must be a whole number.` }
    return { value: n }
  }

  if (kind === 'json') {
    try {
      return { value: JSON.parse(text) }
    } catch {
      return { error: `${label} is not valid JSON. Check the brackets and quotes.` }
    }
  }

  if (kind === 'array') {
    const t = text.trim()
    if (t.startsWith('[')) {
      try {
        const parsed = JSON.parse(t)
        if (Array.isArray(parsed)) return { value: parsed }
      } catch {
        /* a line that merely starts with a bracket is just text */
      }
    }
    const items = text.split('\n').map((s) => s.trim()).filter(Boolean)
    if (!items.length) return { value: null }
    if (NUMERIC_ITEM.test(String(col.format || '').replace(/\[\]$/, ''))) {
      const nums = items.map(Number)
      if (nums.some((n) => !Number.isFinite(n))) return { error: `${label} must be numbers, one per line.` }
      return { value: nums }
    }
    return { value: items }
  }

  if (col.enum && !col.enum.includes(text)) return { error: `${label} must be one of: ${col.enum.join(', ')}.` }
  return { value: text }
}

const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)

/**
 * What to send. Only the fields the owner actually changed, so a column the
 * form cannot represent faithfully is never rewritten as a side effect of
 * editing another. A new row sends every field that has a value.
 *
 * Returns { values } or { errors: { column: message } }.
 */
export function buildPayload(columns, fields, original) {
  const values = {}
  const errors = {}
  for (const col of columns) {
    const result = fromField(col, fields[col.name])
    if (result.error) {
      errors[col.name] = result.error
      continue
    }
    if (original) {
      if (!same(result.value, original[col.name])) values[col.name] = result.value
    } else if (result.value !== null) {
      values[col.name] = result.value
    }
  }
  if (Object.keys(errors).length) return { errors }
  return { values }
}
