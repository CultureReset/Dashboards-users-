// Recommendations guide setup; they do not grant access or install anything.
export function recommendedTables(industry = '') {
  const common = ['entity_hours', 'entity_photos', 'offerings', 'entity_policies', 'faqs']
  const kind = String(industry).toLowerCase()
  if (/restaurant|food|cafe|bar|coffee/.test(kind)) return [...common, 'menu_sections', 'drink_sections', 'happy_hour_sections', 'entity_specials', 'entity_events']
  if (/charter|tour|rental|lodging|hotel|condo/.test(kind)) return [...common, 'bookable_resources', 'pricing_items', 'activity_schedules', 'property_details', 'room_types']
  if (/artist|music|perform/.test(kind)) return [...common, 'entity_events']
  return [...common, 'service_menu', 'entity_team_members']
}

export function calendarStatus(units = []) {
  const feeds = units.flatMap(unit => unit.feeds || []).filter(feed => feed.is_active !== false)
  if (!feeds.length) return 'No feeds added'
  if (feeds.some(feed => /^error:/i.test(feed.last_sync_status || ''))) return 'A feed needs attention'
  if (feeds.some(feed => !/^ok\s*\(/i.test(feed.last_sync_status || ''))) return 'Feeds need verification'
  return `${feeds.length} feed${feeds.length === 1 ? '' : 's'} synchronized`
}
