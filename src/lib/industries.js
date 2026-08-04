import { api } from './apiClient'
import { endpoints } from './endpoints'

// The industry list shown during setup.
//
// `value` is written to entity.entity_type. Which values exist is a fact about
// the database, so fetchIndustries() reads them live from
// GET /api/business/industries — distinct entity_type values with counts,
// computed server-side. Nothing about which industries exist is decided here.
//
// The labels, icons and hints below are the other half: presentation. They do
// not exist in the database and could not be read from it. They are matched
// onto the live values by `value`, and a live value with no entry still shows
// up — titled from its own slug rather than dropped.
//
// PRESENTATION is also the fallback the sign-up form uses. That form runs
// before an account exists, and /api/business/industries is owner-scoped, so
// there is no session to fetch with. Once a business is signed in, every other
// screen uses the live list.

const PRESENTATION = [
  { value: 'restaurant', label: 'Restaurant or bar', icon: '🍽️', hint: 'Menus, happy hour, specials' },
  { value: 'coffee', label: 'Coffee or café', icon: '☕', hint: 'Menu, hours, daily features' },
  { value: 'activity', label: 'Activity or tour', icon: '🎣', hint: 'Charters, rentals, trips, watersports' },
  { value: 'service', label: 'Service business', icon: '🧰', hint: 'Salons, trades, professional services' },
  { value: 'shopping', label: 'Shop or retail', icon: '🛍️', hint: 'Products, inventory, storefront' },
  { value: 'hotel', label: 'Hotel or resort', icon: '🏨', hint: 'Rooms, amenities, booking' },
  { value: 'vacation-rental', label: 'Vacation rental', icon: '🏖️', hint: 'Properties, rates, availability' },
  { value: 'condo', label: 'Condo or complex', icon: '🏢', hint: 'Units, complex amenities' },
  { value: 'park', label: 'Park or public spot', icon: '🌳', hint: 'Access, rules, facilities' },
]

const byValue = new Map(PRESENTATION.map((item) => [item.value, item]))

/** "vacation-rental" → "Vacation rental", for a value nobody has styled yet. */
function titleFrom(value) {
  const words = String(value).replace(/[-_]+/g, ' ').trim()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

/**
 * The industries offered during sign-up, before there is a session to ask
 * with. `place`, `dessert`, `bakery` and `topic` exist in the database too but
 * are tiny or internal, so they aren't offered here — an owner whose listing
 * already carries one keeps it unless they choose something else.
 */
export const INDUSTRIES = PRESENTATION

/**
 * Every entity_type the database actually uses, most common first, decorated
 * with a label and an icon.
 *
 * Falls back to the presentation list if the call fails, so a settings screen
 * still renders something usable rather than an empty picker.
 */
export async function fetchIndustries() {
  try {
    const { industries = [] } = await api.get(endpoints.business.industries())
    if (!industries.length) return PRESENTATION
    return industries.map(({ value, count }) => ({
      ...(byValue.get(value) || { value, label: titleFrom(value), icon: '🏷️', hint: '' }),
      value,
      count,
    }))
  } catch {
    return PRESENTATION
  }
}

export function industryFor(value) {
  return byValue.get(value) || null
}
