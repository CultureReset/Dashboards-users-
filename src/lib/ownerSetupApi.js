import { api } from './apiClient'
import { endpoints } from './endpoints'

/**
 * Owner Setup client. All writes go through gcr-api-clean only (no browser
 * Supabase). Each write carries an Idempotency-Key and an owner-entered reason.
 * The server never returns raw iCal URLs; the UI never echoes them back.
 */
export const newIdempotencyKey = () =>
  (globalThis.crypto?.randomUUID?.() || `k-${Date.now()}-${Math.random().toString(36).slice(2)}`)

const idem = (key) => ({ headers: { 'Idempotency-Key': key } })

export const fetchSetupStatus = () => api.get(endpoints.setup.status())

export const connectListing = (payload, key) =>
  api.post(endpoints.setup.connect(), payload, idem(key))

/** Explicit, owner-confirmed disconnect. */
export const removeConnection = (id, reason, key) =>
  api.del(endpoints.setup.connectId(id), { body: { confirm: true, reason }, ...idem(key) })

/** 0-linked owners: request staff link. Never sends an iCal URL; never writes entity_owners. */
export const requestUnitLink = (payload, key) =>
  api.post(endpoints.setup.linkRequest(), payload, idem(key))
