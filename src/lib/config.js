// Every host this app talks to, in one place, overridable per deployment.
//
// There is only one now. This file used to carry the Supabase project URL and
// the anon key as well, which is what let the dashboard open the database
// directly from the browser — and what put a writable key inside a public
// JavaScript bundle where anyone could read it out of developer tools.
//
// Both are gone. If you find yourself adding a database host back to this
// file, the change is the wrong one: everything goes through gcr-api-clean.
//
// The default is the live API, so a checkout with no .env still points at the
// same one the rest of the GCR ecosystem uses. Set VITE_GCR_API_BASE in
// .env.local (or in the Vercel/Netlify dashboard) to point somewhere else.

// `?? {}` so these modules can also be imported by a plain node script
// (scripts/check-discovery.mjs), where import.meta.env doesn't exist.
const env = import.meta.env ?? {}

/** gcr-api-clean. Every read and every write in this app goes through it. */
export const GCR_API_BASE = (
  env.VITE_GCR_API_BASE || 'https://gcr-api-clean.vercel.app'
).replace(/\/+$/, '')

/** Businesses sign in with their slug; it maps to a derived login address. */
export const LOGIN_DOMAIN = env.VITE_LOGIN_DOMAIN || 'biz.gulfcoastradar.com'

/** How long a single API call may take before it is abandoned. */
export const REQUEST_TIMEOUT_MS = Number(env.VITE_REQUEST_TIMEOUT_MS) || 30000
