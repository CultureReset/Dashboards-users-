/**
 * Removed.
 *
 * This was a second cache written without reading the first. `entityTables.js`
 * already cached sections and `Dashboard.jsx` already rendered from the copy
 * then revalidated over the top — the pattern was there, it just used
 * sessionStorage with a five-minute TTL.
 *
 * Two caches means two answers to "what does this business have", and the one
 * the screen reads and the one the agent reads drift apart.
 *
 * The IndexedDB storage went into `entityTables.js` instead, behind the
 * function names that were already there. Use those:
 *
 *   primeTableCache(slug)   load this device's copy — call once after sign-in
 *   readTableCache(slug)    the copy, synchronously. No TTL.
 *   tableCacheAge(slug)     how old it is, for telling the owner
 *   clearTableCache(slug)   on sign-out and on switching business
 */

export {
  primeTableCache,
  readTableCache,
  tableCacheAge,
  clearTableCache,
} from './entityTables'
