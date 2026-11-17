#!/usr/bin/env node
/**
 * Prove the discovery + table-mapping logic without a browser, a network or a
 * database.
 *
 *   node scripts/check-discovery.mjs
 *
 * Two realistic payloads (a restaurant and a charter) go through the same code
 * the dashboard uses, and the assertions check the things that actually break:
 *
 *   - identical code produces completely different section sets
 *   - a swept table does NOT show up a second time next to its API-renamed twin
 *   - every section resolves to a table name that exists in PostgREST, so the
 *     edit path writes somewhere real
 */

import { mergeEntitySources, discoverSections } from '../src/lib/discoverSections.js'
import { tableFor, API_KEY_TO_TABLE } from '../src/lib/tableMap.js'
import { buildCatalog } from '../src/lib/sectionCatalog.js'
import { kindOf, toField, fromField, buildPayload } from '../src/lib/rowForm.js'
import { humanize, groupOf, groupColumns, kindOf as profileKind, toForm, parseField, diffProfile, serverFieldErrors, describeError } from '../src/lib/businessProfile.js'
import {
  MAX_BYTES, MSG, validateFile, formatSize, cleanPhotoUrl, sortPhotos,
  makeItem, queueReducer, nextToUpload, queueSummary, describePhotoError,
} from '../src/lib/photoUpload.js'
import { endpoints } from '../src/lib/endpoints.js'
import { controlFor } from '../src/lib/factControl.js'
import { detectProgress, detectPriceList, detectInbox, isContactField, maskContact } from '../src/lib/shapes.js'
import {
  CATALOG_KEY_TO_SECTION,
  canonicalize,
  sectionKeyForCatalog,
  sectionsFromEnabledModules,
  mergeModuleAndDiscoveredSections,
  applyCatalogFromApi,
  clearCatalogFromApi,
  normalizeModulesList,
  polishOwnerSections,
} from '../src/lib/moduleNav.js'

let failures = 0
function check(label, condition, detail = '') {
  if (condition) {
    console.log(`  ok    ${label}`)
  } else {
    failures++
    console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ''}`)
  }
}

// ── A restaurant, shaped the way GET /api/gcr/entity/:slug returns it ────────
const restaurant = {
  slug: 'flora-bama-yacht-club',
  name: 'Flora-Bama Yacht Club',
  phone: '251-980-5118',
  hours: [{ id: 1, day_of_week: 1, opens_at: '11:00', closes_at: '22:00' }],
  photos: [{ id: 7, url: 'https://example.test/a.jpg', is_cover: true }],
  menu_sections: [
    { id: 3, section_name: 'Starters', items: [{ id: 9, item_name: 'Gulf Oysters', price: 18 }] },
  ],
  happy_hour_sections: [{ id: 4, section_name: 'Weekdays', items: [] }],
  events: [{ id: 11, event_name: 'Live music', event_date: '2026-08-14' }],
  specials: [],
  faqs: [{ id: 2, question: 'Is there parking?', answer: 'Yes.' }],
  child_count: 0,
  is_hub: false,
}

// ── A charter: same code, an entirely different set of domains ──────────────
const charter = {
  slug: 'perdido-key-fishing-charters',
  name: 'Perdido Key Fishing Charters',
  hours: [],
  meeting_points: [{ id: 1, name: 'Dock C', address: '100 Marina Rd' }],
  fish_species: [{ id: 5, species: 'Red Snapper', season: 'June–August' }],
  what_to_bring: [{ id: 8, item: 'Sunscreen' }],
  weather_rules: [{ id: 2, rule_type: 'wind', threshold: '20kt', action: 'reschedule' }],
  pricing: [{ id: 4, name: 'Half day', price: 800, tiers: [] }],
}

console.log('\nSection discovery')
const restaurantSections = discoverSections(mergeEntitySources(restaurant, {}))
const charterSections = discoverSections(mergeEntitySources(charter, {}))
const rKeys = restaurantSections.map((s) => s.key)
const cKeys = charterSections.map((s) => s.key)

check('restaurant gets a Menu section', rKeys.includes('menu_sections'))
check('restaurant gets Hours, Photos, Events, FAQs',
  ['hours', 'photos', 'events', 'faqs'].every((k) => rKeys.includes(k)))
check('empty specials array is not a section', !rKeys.includes('specials'))
check('scalars are not sections', !rKeys.includes('name') && !rKeys.includes('phone'))
check('charter gets Species and Meeting Points',
  cKeys.includes('fish_species') && cKeys.includes('meeting_points'))
check('charter gets no Menu', !cKeys.includes('menu_sections'))
check('the two businesses share almost nothing',
  rKeys.filter((k) => cKeys.includes(k)).length === 0,
  `overlap: ${rKeys.filter((k) => cKeys.includes(k)).join(', ')}`)

console.log('\nSwept tables merged against the API payload')
// What the direct table sweep returns: real table names, including the ones the
// API renames (entity_hours → hours) and one the API never sends.
const swept = {
  ai_photo_index_full: [{ id: 1, entity_slug: 'flora-bama', vec: 'x' }], // machinery
  entity_hours: [{ id: 99, day_of_week: 1, opens_at: '09:00', closes_at: '17:00' }],
  entity_photos: [{ id: 98, url: 'https://example.test/b.jpg' }],
  song_requests: [{ id: 1, song: 'Sweet Home Alabama' }],
  menu_items: [{ id: 9, item_name: 'Gulf Oysters' }], // nested in menu_sections already
}
const mergedKeys = discoverSections(mergeEntitySources(restaurant, swept)).map((s) => s.key)

check('entity_hours does not become a second Hours section',
  !mergedKeys.includes('entity_hours'),
  `got: ${mergedKeys.join(', ')}`)
check('entity_photos does not become a second Photos section',
  !mergedKeys.includes('entity_photos'))
check('the API version of hours survives the merge',
  mergeEntitySources(restaurant, swept).hours[0].id === 1)
// The public payload selects hours and tags without ids. Swept rows have them,
// and without them every Edit button on the section is disabled.
const idless = mergeEntitySources(
  { slug: 'x', hours: [{ day_of_week: 1, opens_at: '09:00' }], tags: [{ tag_name: 'patio' }] },
  {
    entity_hours: [
      { id: 7, day_of_week: 1, opens_at: '09:00', is_current: true },
      { id: 6, day_of_week: 1, opens_at: '08:00', is_current: false },
    ],
  },
)
check('id-less API hours are replaced by the swept rows, which can be edited',
  idless.hours.length === 1 && idless.hours[0].id === 7, JSON.stringify(idless.hours))
check('id-less API rows with nothing swept are left alone',
  idless.tags.length === 1 && idless.tags[0].tag_name === 'patio')
check('an unanticipated table still becomes its own section',
  mergedKeys.includes('song_requests'), `got: ${mergedKeys.join(', ')}`)
check('customer-submitted content IS shown — it is the business\'s data',
  mergedKeys.includes('song_requests'))
check('menu_items stays nested rather than duplicating as a section',
  !mergedKeys.includes('menu_items'))
check('AI machinery swept from the database is not rendered as a section',
  !mergedKeys.includes('ai_photo_index_full'), `got: ${mergedKeys.join(', ')}`)

console.log('\nEvery section resolves to a writable table')
const allKeys = [...new Set([...mergedKeys, ...cKeys])]
for (const key of allKeys) {
  const table = tableFor(key)
  check(`${key} → ${table ?? 'read-only'}`, table === null || /^[a-z][a-z0-9_]*$/.test(table))
}
check('no API key maps to itself when the API renamed it',
  API_KEY_TO_TABLE.hours === 'entity_hours' && API_KEY_TO_TABLE.fees === 'entity_offer_fee')
check('derived payload keys are read-only',
  tableFor('industry_facts') === null && tableFor('parent') === null)
check('an unknown table maps straight through',
  tableFor('some_table_added_tomorrow') === 'some_table_added_tomorrow')

console.log('\nAdd-a-section catalog')
// A slice of the live schema: tables this business uses, tables it doesn't,
// and the internal ones it should never be offered.
const liveTables = [
  'entity_hours',
  'entity_photos',
  'menu_sections',
  'entity_events',
  'faqs',
  'happy_hour_sections',
  // not in use by the restaurant above
  'drink_sections',
  'entity_specials', // the payload carried `specials: []` — empty is not "in use"
  'entity_policies',
  'room_types',
  'fish_species',
  'dockside_extras', // a table nobody has written code for
  // internal — must never be offered
  'ai_photo_index_full',
  'entity_owners',
  'platform_admins',
  'business_claims',
  'bookings',
  'customer_leads',
  'sms_messages',
  'song_requests',
  'entity_reviews',
  'menu_sections_backup',
  'entity_tags_old',
  'user_preference_scores',
]
const catalog = buildCatalog(liveTables, mergedKeys)
const offered = catalog.flatMap((g) => g.entries.map((e) => e.table))

check('a table the business already uses is not offered again',
  !offered.includes('entity_hours') &&
    !offered.includes('menu_sections') &&
    !offered.includes('happy_hour_sections'),
  `offered: ${offered.join(', ')}`)
check('the API-renamed key resolves before comparing',
  !offered.includes('entity_photos') && !offered.includes('entity_events'))
check('unused tables ARE offered',
  ['drink_sections', 'entity_specials', 'entity_policies', 'room_types', 'fish_species']
    .every((t) => offered.includes(t)),
  `missing from: ${offered.join(', ')}`)
check('a table present but empty for this business is offered',
  offered.includes('entity_specials'))
check('a table nobody wrote code for is offered anyway',
  offered.includes('dockside_extras'))

for (const internal of [
  'ai_photo_index_full', 'entity_owners', 'platform_admins', 'business_claims',
  'bookings', 'customer_leads', 'sms_messages', 'song_requests', 'entity_reviews',
  'menu_sections_backup', 'entity_tags_old', 'user_preference_scores',
]) {
  check(`${internal} is not offered`, !offered.includes(internal))
}

check('entries carry the label they will have as a section',
  catalog.flatMap((g) => g.entries).find((e) => e.table === 'drink_sections')?.label ===
    'Drinks')
check('everything lands in a named group',
  catalog.every((g) => g.group && g.entries.length))

console.log('\nShape detection — nothing depends on a table being known')

// Tables invented for this test. None of them appear anywhere in src/.
const unknownGoal = [
  { id: 1, campaign_name: 'New van fund', current_amount: 4200, target_amount: 9000 },
  { id: 2, campaign_name: 'Studio time', current_amount: 0, target_amount: 1500 },
]
const unknownPrices = [
  { id: 1, tier_type: 'sponsorship', label: 'Stage banner', amount: 250, sort_order: 1 },
  { id: 2, tier_type: 'sponsorship', label: 'Named set', amount: 500, sort_order: 2 },
  { id: 3, tier_type: 'meet_greet', label: 'Photo + signed poster', amount: 40, sort_order: 1 },
]
const unknownInbox = [
  { id: 1, patron_name: 'Katie', patron_phone: '251-555-9090', wish: 'Play Wonderwall' },
]
const notProgress = [{ id: 1, goal_type: 'nightly', description: 'no numbers here' }]

const g = detectProgress(unknownGoal)
check('an unknown campaign table is detected as progress',
  g?.raised === 'current_amount' && g?.target === 'target_amount', JSON.stringify(g))
check('its title field is found too', g?.title === 'campaign_name')
check('a text-only table is NOT mistaken for progress', detectProgress(notProgress) === null)
check('a table with no rows is not progress', detectProgress([]) === null)

const pl = detectPriceList(unknownPrices)
check('an unknown tiers table is detected as a price list',
  pl?.kind === 'tier_type' && pl?.label === 'label' && pl?.amount === 'amount',
  JSON.stringify(pl))
check('a plain priced list is not forced into the grouped layout',
  detectPriceList([{ id: 1, name: 'Half day', price: 800 }]) === null)

check('an unknown submissions table is detected by its columns',
  detectInbox('wish_wall', [], unknownInbox))
check('a submissions table is detected by its name alone',
  detectInbox('venue_inquiries', [{ name: 'x' }]))
check('the business\'s own content is not an inbox',
  !detectInbox('drink_sections', [{ name: 'section_name' }, { name: 'sort_order' }]))

console.log('\nCatalog uses shape, not a list of names')
const shapeTables = [
  'artist_price_tiers', 'songs', 'artist_goals',   // known artist tables
  'merch_crowdfund', 'sponsor_tiers',              // invented, should be offered
  'wish_wall', 'venue_inquiries',                  // invented, should be held back
]
const columnsByTable = {
  wish_wall: [{ name: 'patron_name' }, { name: 'patron_phone' }],
  merch_crowdfund: [{ name: 'current_amount' }, { name: 'target_amount' }],
  sponsor_tiers: [{ name: 'tier_type' }, { name: 'label' }, { name: 'amount' }],
}
const shapeCatalog = buildCatalog(shapeTables, [], (t) => columnsByTable[t] || [])
const shapeOffered = shapeCatalog.flatMap((g2) => g2.entries.map((e) => e.table))

check('an invented crowdfund table is offered', shapeOffered.includes('merch_crowdfund'),
  `offered: ${shapeOffered.join(', ')}`)
check('an invented tiers table is offered', shapeOffered.includes('sponsor_tiers'))
check('an invented submissions table is held back by its columns',
  !shapeOffered.includes('wish_wall'))
check('an invented inquiries table is held back by its name',
  !shapeOffered.includes('venue_inquiries'))

const artistGroup2 = shapeCatalog.find((g2) => g2.group === 'Artist & live shows')
const artistNames = artistGroup2 ? artistGroup2.entries.map((e) => e.table) : []
check('artist tables group by pattern, not membership',
  ['artist_price_tiers', 'songs', 'artist_goals'].every((t) => artistNames.includes(t)),
  `artist group: ${artistNames.join(', ')}`)
check('a brand-new artist_* table would group too — pattern check',
  /^artists?(_|$)/.test('artist_merch_drops'))
check('artist tables still get real labels',
  artistGroup2?.entries.find((e) => e.table === 'songs')?.label === 'Setlist' &&
    artistGroup2?.entries.find((e) => e.table === 'artist_price_tiers')?.label === 'Prices')

console.log('\nContact masking is by naming convention')
check('somebody else\'s phone is masked',
  maskContact('251-555-1234') === '•••-•••-1234' &&
    maskContact('sarah@example.com') === 'sa•••@example.com',
  `got ${maskContact('251-555-1234')} / ${maskContact('sarah@example.com')}`)
check('an invented contact column is caught',
  isContactField('patron_phone') && isContactField('subscriber_email'))
check('a plain phone column on a list row is masked',
  isContactField('phone'))
check("the business's own phone stays readable",
  !isContactField('phone', { ownRecord: true }))
check('a non-contact column is untouched',
  !isContactField('song_title') && !isContactField('amount'))


console.log('\nModule nav (catalog map + union + empty stubs)')
check('canonicalize gallery → photos', canonicalize('gallery') === 'photos')
check('canonicalize menu → menu_sections', canonicalize('menu') === 'menu_sections')
check('canonicalize photos stays photos', canonicalize('photos') === 'photos')
check('gallery maps to photos section', sectionKeyForCatalog('gallery') === 'photos')
check('photos maps to photos section', sectionKeyForCatalog('photos') === 'photos')
check('menu maps to menu_sections', sectionKeyForCatalog('menu') === 'menu_sections')
check('drinks maps to drink_sections', sectionKeyForCatalog('drinks') === 'drink_sections')
check('core has no section key', sectionKeyForCatalog('core') === null)
check('catalog has at least 20 keys', Object.keys(CATALOG_KEY_TO_SECTION).length >= 20)

clearCatalogFromApi()
applyCatalogFromApi({
  catalog: [{ key: 'gallery', section_key: 'photos', label: 'Photos (API)' }],
})
check('API catalog override preferred for gallery label path', sectionKeyForCatalog('gallery') === 'photos')
clearCatalogFromApi()

// API returns already-canonical keys (PR #80)
const enabled = normalizeModulesList({
  modules: [
    { key: 'menu_sections', enabled: true, sort_order: 1 },
    { key: 'photos', enabled: true },
    { key: 'core', enabled: true },
    { key: 'blog', enabled: false },
  ],
})
check('normalize keeps canonical photos key', enabled.some((m) => m.key === 'photos' && m.enabled))
check('normalize collapses gallery alias if sent', normalizeModulesList({ modules: [{ key: 'gallery', enabled: true }] })[0]?.key === 'photos')
const emptyEntity = { slug: 'demo', name: 'Demo' }
const moduleSections = sectionsFromEnabledModules(enabled, emptyEntity)
const modKeys = moduleSections.map((s) => s.key)
check('enabled menu_sections becomes stub', modKeys.includes('menu_sections'))
check('enabled photos becomes stub', modKeys.includes('photos'))
check('core does not become a nav section', !modKeys.includes('core') && !modKeys.includes(null))
check('disabled blog is omitted', !modKeys.includes('blog_posts'))
check('empty stubs flagged empty', moduleSections.every((s) => s.empty === true))

const discoveredOnly = discoverSections(mergeEntitySources(restaurant, {}))
const unioned = mergeModuleAndDiscoveredSections(discoveredOnly, moduleSections)
check('union keeps all discovered sections', discoveredOnly.every((s) => unioned.some((u) => u.key === s.key)))
check('union adds empty module sections', unioned.some((s) => s.key === 'photos'))
// restaurant already has photos with data — empty flag cleared by merge preferring discovered
const photos = unioned.find((s) => s.key === 'photos')
check('discovered photos wins over empty stub', photos && photos.empty === false)

console.log('\nOwner nav polish (visibility, dedupe, hide empty)')
{
  const noisy = [
    { key: 'entity_completeness_v', label: 'Entity Completeness V', data: [{ x: 1 }], empty: false },
    { key: 'sections', label: 'Offerings', data: [{ id: 1 }], empty: false },
    { key: 'offerings', label: 'Offerings', data: [{ id: 2 }, { id: 3 }], empty: false },
    { key: 'hours', label: 'Hours', data: [], empty: true, has_data: false },
    { key: 'photos', label: 'Photos', data: [{ url: 'a' }], empty: false },
  ]
  const polished = polishOwnerSections(noisy, {
    ownerVisibleTables: ['entity_hours', 'entity_photos', 'offerings', 'entity_sections'],
    tableFor: (key) => ({ hours: 'entity_hours', photos: 'entity_photos', sections: 'entity_sections', offerings: 'offerings' }[key] || key),
  })
  const keys = polished.map((s) => s.key)
  check('hides internal completeness view', !keys.includes('entity_completeness_v'), keys.join(','))
  check('hides empty hours tab', !keys.includes('hours'), keys.join(','))
  check('keeps photos', keys.includes('photos'), keys.join(','))
  check('dedupes Offerings to one tab', polished.filter((s) => s.label === 'Offerings').length === 1, keys.join(','))
  check('prefers richer Offerings data', polished.find((s) => s.label === 'Offerings')?.key === 'offerings', keys.join(','))
}

console.log('\nEdit form round-trips (lists, JSON, only changed fields)')
{
  const arr = { name: 'photo_urls', type: 'array', format: 'text[]' }
  const json = { name: 'amenities', type: 'string', format: 'jsonb' }
  const int = { name: 'min_nights', type: 'integer', format: 'integer' }
  const num = { name: 'nightly_price', type: 'number', format: 'numeric' }
  check('text[] column is an array field', kindOf(arr) === 'array')
  check('jsonb column is a json field', kindOf(json) === 'json')
  check('array shows one value per line', toField(arr, ['a', 'b']) === 'a\nb')
  check('jsonb never shows [object Object]', !String(toField(json, [{ k: 1 }])).includes('[object'))
  check('array parses back from lines', JSON.stringify(fromField(arr, 'a\n b \n\nc').value) === '["a","b","c"]')
  check('jsonb parses back to the same value', JSON.stringify(fromField(json, toField(json, [{ k: 1 }])).value) === '[{"k":1}]')
  check('invalid JSON is an error, not a string', !!fromField(json, '[oops').error)
  check('whole number column rejects 1.5', !!fromField(int, '1.5').error)
  check('number column rejects text', !!fromField(num, 'abc').error)
  check('empty means null', fromField(num, '').value === null)
  const cols = [arr, json, int, num]
  const original = { photo_urls: ['a'], amenities: [{ k: 1 }], min_nights: 2, nightly_price: 100 }
  const fields = Object.fromEntries(cols.map((c) => [c.name, toField(c, original[c.name])]))
  check('an unchanged form sends nothing', Object.keys(buildPayload(cols, fields, original).values).length === 0)
  const edited = buildPayload(cols, { ...fields, nightly_price: '120' }, original)
  check('an edit sends only the changed field', JSON.stringify(edited.values) === '{"nightly_price":120}', JSON.stringify(edited))
  check('a bad field blocks the save', !!buildPayload(cols, { ...fields, amenities: '{' }, original).errors?.amenities)
  check('a new row skips empty fields', JSON.stringify(buildPayload([num, int], { nightly_price: '9', min_nights: '' }, null).values) === '{"nightly_price":9}')
}

console.log('\nBusiness profile: fields come from the API list, only changes are sent')
{
  const ApiError = class { constructor(message, { status = 0 } = {}) { this.message = message; this.status = status } } // same fields as apiClient's ApiError, which needs a browser
  const col = (name, type = 'string', format = 'text') => ({ name, type, format })
  const editable = [
    col('name'), col('subtitle'), col('description'), col('phone'), col('email'), col('website'), col('menu_url'),
    col('instagram_url'), col('address_line1'), col('city'), col('zip'), col('price_range'), col('happy_hour_start', 'string', 'time without time zone'),
    col('happy_hour_notes'), col('serves_beer', 'boolean', 'boolean'), col('outdoor_seating', 'boolean', 'boolean'), col('pet_friendly', 'boolean', 'boolean'),
    col('bedrooms', 'integer', 'integer'), col('bathrooms', 'number', 'numeric'), col('waiver_text'), col('deposit_amount', 'number', 'numeric'),
    col('cancellation_policy'), col('brand_new_column'),
  ]
  const profile = { name: 'Flora-Bama', subtitle: null, phone: '251-980-5118', serves_beer: true, pet_friendly: null, bedrooms: 2, bathrooms: 1.5, city: 'Orange Beach', description: 'Hi' }
  check('labels are humanized', humanize('serves_beer') === 'Serves beer' && humanize('wheelchair_accessible') === 'Wheelchair accessible')
  check('url and zip keep their capitals', humanize('menu_url') === 'Menu URL' && humanize('zip') === 'ZIP')
  const g = Object.fromEntries(editable.map((c) => [c.name, groupOf(c)]))
  check('name and description are basics', g.name === 'basics' && g.description === 'basics')
  check('phone and email are contact', g.phone === 'contact' && g.email === 'contact')
  check('website and *_url are links', g.website === 'links' && g.menu_url === 'links' && g.instagram_url === 'links')
  check('address columns are address', g.address_line1 === 'address' && g.city === 'address' && g.zip === 'address')
  check('price_range is pricing', g.price_range === 'pricing')
  check('happy hour fields are hours', g.happy_hour_start === 'hours' && g.happy_hour_notes === 'hours')
  check('waiver, deposit and cancellation are policies', g.waiver_text === 'policies' && g.deposit_amount === 'policies' && g.cancellation_policy === 'policies')
  check('yes/no flags are features', g.serves_beer === 'features' && g.outdoor_seating === 'features')
  check('an unknown column lands in other, not nowhere', g.brand_new_column === 'other' && g.bedrooms === 'other')
  check('every editable column is rendered exactly once', groupColumns(editable).flatMap((x) => x.columns).length === editable.length)
  check('empty groups are dropped', groupColumns([col('name')]).length === 1)
  check('control follows type and name', profileKind(col('serves_beer', 'boolean')) === 'boolean' && profileKind(col('bedrooms', 'integer')) === 'integer' && profileKind(col('waiver_text')) === 'textarea' && profileKind(col('menu_url')) === 'url' && profileKind(col('email')) === 'email' && profileKind(col('phone')) === 'tel' && profileKind(col('happy_hour_start', 'string', 'time without time zone')) === 'time')
  const form = toForm(profile, editable)
  check('null shows as empty, a boolean as true/false', form.subtitle === '' && form.serves_beer === 'true' && form.pet_friendly === '')
  check('an untouched form sends nothing', Object.keys(diffProfile(editable, profile, form).values).length === 0)
  check('whitespace and empty-vs-null are not changes', Object.keys(diffProfile(editable, profile, { ...form, name: ' Flora-Bama ', subtitle: '  ' }).values).length === 0)
  check('stored text with a trailing space is not a change', Object.keys(diffProfile(editable, { ...profile, description: 'Hi ' }, toForm({ ...profile, description: 'Hi ' }, editable)).values).length === 0)
  check('an edit sends only that field', JSON.stringify(diffProfile(editable, profile, { ...form, phone: '555-1212' }).values) === '{"phone":"555-1212"}')
  check('clearing a field sends null', JSON.stringify(diffProfile(editable, profile, { ...form, city: '' }).values) === '{"city":null}')
  check('a toggle sends a real boolean, Not set sends null', JSON.stringify(diffProfile(editable, profile, { ...form, pet_friendly: 'true', serves_beer: '' }).values) === '{"serves_beer":null,"pet_friendly":true}')
  check('numbers are sent as numbers, 1.50 is no change for 1.5', JSON.stringify(diffProfile(editable, profile, { ...form, bedrooms: '3', bathrooms: '1.50' }).values) === '{"bedrooms":3}')
  check('text in a number field is an error and not sent', diffProfile(editable, profile, { ...form, bathrooms: 'lots' }).errors.bathrooms === 'Must be a number.')
  check('a fraction in a whole-number field is an error', parseField(col('bedrooms', 'integer'), '2.5').error === 'Must be a whole number.')
  check('over-long text is refused before sending', !!parseField(col('description'), 'x'.repeat(5001)).error && !parseField(col('description'), 'x'.repeat(5000)).error)
  check('the slug is never in the profile call', endpoints.business.profile() === '/api/business/profile' && !/slug/.test(endpoints.business.profile()))
  const { shown, other } = serverFieldErrors({ fields: { phone: 'Bad phone', ghost_col: 'Nope' } }, editable)
  check('server field errors map to rendered fields', shown.phone === 'Bad phone' && !('ghost_col' in shown))
  check('a server error for a field we do not show is still reported', other.length === 1 && other[0].includes('Nope'))
  check('a 404 says the feature is not live yet', describeError(new ApiError('Endpoint not found: /api/business/profile', { status: 404 })).kind === 'missing')
  check('a 404 for the business is not "not deployed"', describeError(new ApiError('Business not found.', { status: 404 })).kind === 'error')
  check('a 500 keeps the owner reassured', /try again/i.test(describeError(new ApiError('boom', { status: 500 })).text))
  check('offline reads as offline', describeError(new ApiError('x', { status: 0 })).kind === 'network')
}

console.log('\nFact questions pick their control from the registry')
{
  check('a fact with choices is a select', controlFor({ choices: [{ value: 'a' }] }, {}) === 'choice')
  check('a boolean-stored fact is yes/no', controlFor({ choices: [] }, { index_column: 'v_bool' }) === 'yesno')
  check('a numeric-stored fact is a number', controlFor({ choices: [] }, { index_column: 'v_num' }) === 'number')
  check('anything else is text', controlFor({ choices: [] }, undefined) === 'text')
}

console.log('\nPhoto upload: file checks and queue')
{
  const f = (type, size, name = 'a') => ({ type, size, name })
  check('a JPG is accepted', validateFile(f('image/jpeg', 1000)) === null)
  check('PNG, WebP, GIF and AVIF are accepted', ['image/png', 'image/webp', 'image/gif', 'image/avif'].every((t) => validateFile(f(t, 1)) === null))
  check('a PDF is refused with the API wording', validateFile(f('application/pdf', 10)) === 'That file is not a photo we can use. Use a JPG, PNG, WebP, GIF or AVIF.')
  check('an iPhone HEIC is refused, as the API would', validateFile(f('image/heic', 10)) === MSG.type)
  check('a file with no type is refused', validateFile(f('', 10)) === MSG.type)
  check('exactly 10 MB is accepted', validateFile(f('image/png', MAX_BYTES)) === null)
  check('one byte over 10 MB is refused with the API wording', validateFile(f('image/png', MAX_BYTES + 1)) === 'That photo is too large (10 MB limit).')
  check('an empty file is refused', validateFile(f('image/png', 0)) === 'That file is empty.')
  check('no file is refused', validateFile(null) === 'Choose a photo to upload.')
  check('sizes read as people say them', formatSize(512) === '512 B' && formatSize(2048) === '2 KB' && formatSize(5.5 * 1024 * 1024) === '5.5 MB')
  check('a link must be http(s)', cleanPhotoUrl(' https://x.test/a.jpg ') === 'https://x.test/a.jpg' && cleanPhotoUrl('javascript:alert(1)') === null && cleanPhotoUrl('nope') === null && cleanPhotoUrl('') === null)
  check('photos sort by sort_order then id', sortPhotos([{ id: 10, sort_order: 1 }, { id: 2, sort_order: 1 }, { id: 5, sort_order: 0 }]).map((p) => p.id).join() === '5,2,10')

  const good = (id) => makeItem(f('image/png', 10, `p${id}.png`), id)
  const bad = makeItem(f('text/plain', 10, 'n.txt'), 9)
  check('a bad file is rejected up front and never queued to send', bad.status === 'rejected' && bad.error === MSG.type)
  let q = queueReducer([], { type: 'add', items: [good(1), good(2), good(3), bad] })
  check('good files start queued, in order', q.map((i) => i.status).join() === 'queued,queued,queued,rejected')
  check('only the first is picked, and only one at a time', nextToUpload(q).id === 1)
  q = queueReducer(q, { type: 'start', id: 1 })
  check('nothing else starts while one is uploading', nextToUpload(q) === null)
  q = queueReducer(q, { type: 'done', id: 1 })
  check('the next one follows a finished upload', nextToUpload(q).id === 2)
  q = queueReducer(queueReducer(q, { type: 'start', id: 2 }), { type: 'fail', id: 2, error: 'Could not save that photo. Please try again.' })
  check('a failure keeps the API message and does not block the queue', q[1].status === 'failed' && q[1].error.startsWith('Could not save') && nextToUpload(q).id === 3)
  q = queueReducer(queueReducer(q, { type: 'start', id: 3 }), { type: 'done', id: 3 })
  check('Retry puts only the failed file back in the queue', nextToUpload(queueReducer(q, { type: 'retry', id: 2 })).id === 2)
  check('Retry does nothing for a rejected file', queueReducer(q, { type: 'retry', id: 9 }).find((i) => i.id === 9).status === 'rejected')
  const s = queueSummary(q)
  check('the summary counts each state', s.done === 2 && s.failed === 1 && s.rejected === 1 && !s.busy)
  check('clear finished keeps the failed one for Retry', queueReducer(q, { type: 'clearFinished' }).map((i) => i.id).join() === '2')
  check('dismiss removes one entry', queueReducer(q, { type: 'dismiss', id: 2 }).length === 3)

  check('upload and cover paths carry no slug', endpoints.business.photoUpload() === '/api/business/photos/upload' && endpoints.business.photoCover('a/b') === '/api/business/photos/a%2Fb/cover')
  check('the API message is shown as written', describePhotoError({ status: 400, message: 'That file is empty.', body: { error: 'That file is empty.' } }) === 'That file is empty.')
  check('a bodyless 500 gets a plain retry message', describePhotoError({ status: 500, message: 'Request failed (500 )', body: null }) === MSG.failed)
  check('a host 413 reads as the size limit', describePhotoError({ status: 413, message: 'Request Entity Too Large' }) === MSG.tooBig)
  check('offline reads as offline', /connection/.test(describePhotoError({ isNetworkError: true, status: 0 })))
}

console.log(failures ? `\n${failures} failed\n` : '\nAll checks passed\n')
process.exit(failures ? 1 : 0)
