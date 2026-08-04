// The industry list shown during setup.
//
// `value` is written to entity.entity_type, so these are the values the live
// database already uses — checked against it rather than invented. Counts at
// the time of writing: service 958, activity 878, restaurant 702, shopping
// 649, condo 283, vacation-rental 178, park 142, hotel 139, coffee 84.
//
// `place`, `dessert`, `bakery` and `topic` exist too but are tiny or internal,
// so they aren't offered — an owner whose listing already carries one keeps it
// unless they choose something else.
//
// This drives two things later: which sections a business is nudged toward,
// and which apps get recommended in the store. It is not a hard filter —
// discovery still shows whatever the business actually has data for.

export const INDUSTRIES = [
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

export function industryFor(value) {
  return INDUSTRIES.find((i) => i.value === value) || null
}
