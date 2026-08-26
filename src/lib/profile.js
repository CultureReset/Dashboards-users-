import { api } from './apiClient'
import { endpoints } from './endpoints'

// The business's own details: name, contact, address, links, hours.
//
// This is the one part of the dashboard that does not go through
// /api/business. That router refuses `entity` by design — its allow-list is
// built from tables with an `entity_slug` column and `entity` is keyed by
// `slug` — so the profile is read and written through /api/user instead.
//
// That door has a sharp edge worth knowing about. middleware/auth.js only sets
// req.gcrUserId in a fallback branch that runs when the account has no row in
// the legacy `users` table. Phone-registered businesses have none, so it works
// for them. An account that does have one gets 403 "GCR account required", and
// `describe` below says exactly that rather than pretending the save failed.

/** The fields routes/user.js will actually persist. Anything else is dropped. */
export const PROFILE_FIELDS = [
  'name', 'subtitle', 'phone', 'email',
  'address_line_1', 'city', 'state', 'zip',
  'description', 'website_url', 'booking_url', 'reservation_url', 'order_url',
  'social_instagram', 'social_facebook', 'social_tiktok',
  'hero_image_url', 'price_range',
]

export const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

/** Turn an API failure into something the owner can act on. */
function describe(error) {
  if (error?.status === 403) {
    return 'This account cannot edit the business profile. It is a legacy account — support has to move it.'
  }
  if (error?.status === 404) return 'No business is linked to this account yet.'
  if (error?.isNetworkError) return 'Could not reach the server — check your connection.'
  return error?.message || 'Something went wrong.'
}

/** Entity, account profile, hours and installed modules, in one call. */
export async function fetchProfile() {
  try {
    return await api.get(endpoints.profile.read())
  } catch (error) {
    throw new Error(describe(error))
  }
}

/** Save the changed fields. Sending only what changed keeps the diff honest. */
export async function saveProfile(changes) {
  const values = {}
  for (const field of PROFILE_FIELDS) {
    if (changes[field] !== undefined) values[field] = changes[field]
  }
  try {
    return await api.put(endpoints.profile.write(), values)
  } catch (error) {
    throw new Error(describe(error))
  }
}

/**
 * Replace the hours for the days present in `rows`.
 *
 * The API deletes and re-inserts per day rather than upserting, because a day
 * can legally have two stretches — lunch and dinner. A day left out of `rows`
 * is untouched, so closing a day means sending it with `is_closed` set, not
 * omitting it.
 */
export async function saveHours(rows) {
  try {
    return await api.put(endpoints.profile.hours(), rows)
  } catch (error) {
    throw new Error(describe(error))
  }
}
