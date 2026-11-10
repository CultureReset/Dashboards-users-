import { api } from './apiClient'
import { endpoints } from './endpoints'

/** Overview: owned units + feeds + export URLs. */
export const fetchCalendar = (slug) =>
  api.get(endpoints.ical.overview(), { query: slug ? { slug } : undefined })

export const fetchExportUrl = (slug) =>
  api.get(endpoints.ical.feedUrl(), { query: slug ? { slug } : undefined })

export const regenerateExportUrl = (slug) =>
  api.post(endpoints.ical.regenerate(), {}, { query: slug ? { slug } : undefined })

export const addIcalFeed = (payload, slug) =>
  api.post(endpoints.ical.external(), payload, { query: slug ? { slug } : undefined })

export const removeIcalFeed = (id, slug) =>
  api.del(endpoints.ical.externalId(id), { query: slug ? { slug } : undefined })

export const syncIcalFeed = (id, slug) =>
  api.post(endpoints.ical.syncNow(id), {}, { query: slug ? { slug } : undefined })

/** One month, day by day: availability, bookings and the owner's own blocks. */
export const fetchCalendarMonth = (month) =>
  api.get(endpoints.calendar.month(), { query: month ? { month } : undefined })

/** Close a date or a range (inclusive). */
export const blockDates = ({ date, end_date, note }) =>
  api.post(endpoints.calendar.block(), { date, end_date, note })

/** Re-open dates the owner closed. Blocks from a synced calendar are refused. */
export const unblockDates = (id) => api.del(endpoints.calendar.blockId(id))

/** How many units/spots/rooms can be booked on one day (null clears it). */
export const saveCapacity = (daily_capacity) =>
  api.put(endpoints.calendar.capacity(), { daily_capacity })
