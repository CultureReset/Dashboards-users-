/**
 * Photo upload logic with no DOM and no network: what a file must be to be
 * accepted, and the state of a queue of files being sent one at a time.
 *
 * The wording of every message matches lib/photoUpload.js in gcr-api-clean, so
 * an owner reads the same sentence whether the browser or the server caught it.
 * The server still checks everything; these checks only save a wasted upload.
 */

export const MAX_BYTES = 10 * 1024 * 1024

/** MIME types the API accepts, in the order the message lists them. */
export const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif']

export const MSG = {
  none: 'Choose a photo to upload.',
  type: 'That file is not a photo we can use. Use a JPG, PNG, WebP, GIF or AVIF.',
  empty: 'That file is empty.',
  tooBig: 'That photo is too large (10 MB limit).',
  failed: 'Could not save that photo. Please try again.',
}

/** The problem with a file, in plain words, or null when it can be uploaded. */
export function validateFile(file) {
  if (!file) return MSG.none
  if (!ACCEPTED_TYPES.includes(String(file.type || '').toLowerCase())) return MSG.type
  if (!file.size) return MSG.empty
  if (file.size > MAX_BYTES) return MSG.tooBig
  return null
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
  if (error.status === 413) return MSG.tooBig
  if (error.isNotLinked) return 'This account is not linked to a business yet.'
  const fromBody = error.body && typeof error.body === 'object' && typeof error.body.error === 'string'
  if (error.status >= 500 && !fromBody) return fallback
  return error.message || fallback
}

// ---------------------------------------------------------------- the queue ---
//
// status: queued -> uploading -> done | failed;   failed -> queued (Retry)
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
  if (items.some((i) => i.status === 'uploading')) return null
  return items.find((i) => i.status === 'queued') || null
}

/** "2 of 5 uploaded" style summary for a screen reader and the header. */
export function queueSummary(items) {
  const count = (s) => items.filter((i) => i.status === s).length
  return {
    total: items.length,
    queued: count('queued'),
    uploading: count('uploading'),
    done: count('done'),
    failed: count('failed'),
    rejected: count('rejected'),
    busy: count('queued') + count('uploading') > 0,
  }
}
