/**
 * Photo upload logic with no DOM and no network: what a file must be to be
 * accepted, and the state of a queue of files being sent one at a time.
 *
 * The wording of every message matches lib/photoUpload.js in gcr-api-clean, so
 * an owner reads the same sentence whether the browser or the server caught it.
 * The server still checks everything; these checks only save a wasted upload.
 */

/** The API's limit on the file as chosen. Bigger than this is refused outright. */
export const MAX_BYTES = 10 * 1024 * 1024

/**
 * What is actually sent has to fit the host's request-body cap (about 4.5 MB
 * on Vercel), so anything bigger than this is shrunk in the browser first.
 */
export const SHRINK_AT = 3.5 * 1024 * 1024
export const MAX_DIMENSION = 2560
export const QUALITY_STEPS = [0.85, 0.75, 0.65, 0.55, 0.5]

/** MIME types the API accepts, in the order the message lists them. */
export const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif']

export const MSG = {
  none: 'Choose a photo to upload.',
  type: 'That file is not a photo we can use. Use a JPG, PNG, WebP, GIF or AVIF.',
  empty: 'That file is empty.',
  tooBig: 'That photo is too large (10 MB limit).',
  gifBig: 'That GIF is too large (3.5 MB limit). Use a smaller GIF.',
  serverTooBig: 'That photo is too large for the server. Try a smaller photo.',
  failed: 'Could not save that photo. Please try again.',
}

/** The problem with a file, in plain words, or null when it can be uploaded. */
export function validateFile(file) {
  if (!file) return MSG.none
  if (!ACCEPTED_TYPES.includes(String(file.type || '').toLowerCase())) return MSG.type
  if (!file.size) return MSG.empty
  // A GIF is never re-encoded (it would stop moving), so it has to fit as is.
  if (String(file.type).toLowerCase() === 'image/gif' && file.size > SHRINK_AT) return MSG.gifBig
  // Everything else over the API limit is refused; up to it, it gets shrunk.
  if (file.size > MAX_BYTES) return MSG.tooBig
  return null
}

/** Dimensions that fit `max` on the longer side, same aspect, never enlarged. */
export function fitWithin(width, height, max = MAX_DIMENSION) {
  const longer = Math.max(width, height)
  if (!(longer > max)) return { width, height }
  const k = max / longer
  return { width: Math.max(1, Math.round(width * k)), height: Math.max(1, Math.round(height * k)) }
}

/** Shrink when the file is over the send size, or the picture is bigger than needed. GIFs never. */
export function needsShrink({ type, size, width, height }) {
  if (String(type).toLowerCase() === 'image/gif') return false
  return size > SHRINK_AT || Math.max(width || 0, height || 0) > MAX_DIMENSION
}

/** The next JPEG quality to try, or null once the floor has been tried. */
export function nextQuality(current) {
  if (current == null) return QUALITY_STEPS[0]
  const i = QUALITY_STEPS.findIndex((q) => Math.abs(q - current) < 1e-9)
  return i >= 0 && i + 1 < QUALITY_STEPS.length ? QUALITY_STEPS[i + 1] : null
}

/** Name for the re-encoded file: same name, .jpg extension. */
export function jpegName(name) {
  const base = String(name || 'photo').replace(/\.[^./\\]+$/, '')
  return `${base || 'photo'}.jpg`
}

export function formatSize(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/** Only http(s) links are worth adding by URL. Returns the trimmed URL or null. */
export function cleanPhotoUrl(value) {
  const text = String(value ?? '').trim()
  if (!text) return null
  try {
    const url = new URL(text)
    return url.protocol === 'http:' || url.protocol === 'https:' ? text : null
  } catch {
    return null
  }
}

/** Photos in display order: sort_order, then id, so the order is stable. */
export function sortPhotos(photos) {
  return [...(photos || [])].sort(
    (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || String(a.id).localeCompare(String(b.id), undefined, { numeric: true }),
  )
}

/** An error worth showing an owner, in the API's own words where it has them. */
export function describePhotoError(error, fallback = MSG.failed) {
  if (!error) return fallback
  if (error.isNetworkError) return 'Could not reach the server. Check your connection and try again.'
  // The host rejects an oversized body before the API sees it, with no JSON.
  if (error.status === 413) return MSG.serverTooBig
  if (error.isNotLinked) return 'This account is not linked to a business yet.'
  const fromBody = error.body && typeof error.body === 'object' && typeof error.body.error === 'string'
  if (error.status >= 500 && !fromBody) return fallback
  return error.message || fallback
}

// ---------------------------------------------------------------- the queue ---
//
// status: queued -> shrinking -> uploading -> done | failed;   failed -> queued (Retry)
//         rejected = never sent, the browser-side check said no (no Retry: the
//         same file would be rejected again).

/** One queue entry for a file. `id` comes from the caller so this stays pure. */
export function makeItem(file, id) {
  const problem = validateFile(file)
  return {
    id,
    file,
    name: file?.name || 'Photo',
    size: file?.size ?? 0,
    status: problem ? 'rejected' : 'queued',
    error: problem || '',
  }
}

const patch = (items, id, change) => items.map((i) => (i.id === id ? { ...i, ...change } : i))

export function queueReducer(items, action) {
  switch (action.type) {
    case 'add':
      return [...items, ...action.items]
    case 'shrinking':
      return patch(items, action.id, { status: 'shrinking', error: '' })
    case 'reject':
      return patch(items, action.id, { status: 'rejected', error: action.error || MSG.type })
    case 'start':
      return patch(items, action.id, { status: 'uploading', error: '' })
    case 'done':
      return patch(items, action.id, { status: 'done', error: '' })
    case 'fail':
      return patch(items, action.id, { status: 'failed', error: action.error || MSG.failed })
    case 'retry':
      return items.map((i) => (i.id === action.id && i.status === 'failed' ? { ...i, status: 'queued', error: '' } : i))
    case 'dismiss':
      return items.filter((i) => i.id !== action.id)
    case 'clearFinished':
      return items.filter((i) => i.status !== 'done' && i.status !== 'rejected')
    default:
      return items
  }
}

/** The next file to send: one at a time, in the order they were added. */
export function nextToUpload(items) {
  if (items.some((i) => i.status === 'uploading' || i.status === 'shrinking')) return null
  return items.find((i) => i.status === 'queued') || null
}

/** "2 of 5 uploaded" style summary for a screen reader and the header. */
export function queueSummary(items) {
  const count = (s) => items.filter((i) => i.status === s).length
  return {
    total: items.length,
    queued: count('queued'),
    shrinking: count('shrinking'),
    uploading: count('uploading'),
    done: count('done'),
    failed: count('failed'),
    rejected: count('rejected'),
    busy: count('queued') + count('shrinking') + count('uploading') > 0,
  }
}
