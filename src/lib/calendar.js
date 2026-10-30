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
