import { api } from './apiClient'
import { endpoints } from './endpoints'

// The business's own devices: a cloud Android, a browser worker, a real phone.
//
// This file is the only place the dashboard talks to /api/devices. Pages call
// these functions; nothing builds a device URL by hand.
//
// Two rules the API enforces and this file surfaces rather than hides:
//
//   1. A device is only "online" if it checked in recently. The server sends
//      `online` computed from its heartbeat, not the stored status column, so
//      a green dot never outlives the agent that earned it.
//   2. A session token is returned exactly once. It is held in memory for the
//      life of the viewer and never written to storage — a device someone can
//      watch is not something to leave a replayable key lying around for.

/** Every device this business owns, newest last. */
export async function fetchDevices() {
  return api.get(endpoints.devices.list())
}

/** One device, with its installed apps and any session already open. */
export async function fetchDevice(id) {
  return api.get(endpoints.devices.one(id))
}

/** Provision a new device. It comes back `provisioning` until the agent checks in. */
export async function provisionDevice({ name, kind, region }) {
  return api.post(endpoints.devices.list(), { name, kind, region })
}

/**
 * Open a viewing or controlling session.
 *
 * Returns `{ session, stream_url, token }`. Keep the token in component state
 * and pass it to the stream; do not persist it. Attempting a session on a
 * device that stopped checking in returns 409 with a message worth showing.
 */
export async function openSession(id, mode = 'view') {
  return api.post(endpoints.devices.session(id), { mode })
}

/** Close the live session. Safe to call when none is open. */
export async function closeSession(id) {
  return api.del(endpoints.devices.session(id))
}

/** Remove a device and everything provisioned for it. */
export async function removeDevice(id) {
  return api.del(endpoints.devices.one(id))
}

/** Human label for a device kind, so the UI never shows a raw enum. */
export function kindLabel(kind) {
  return {
    'android-cloud': 'Cloud Android',
    'android-physical': 'Physical phone',
    browser: 'Browser worker',
    container: 'Container',
  }[kind] || kind
}

/**
 * What the badge should say. `provisioning` is deliberately distinct from
 * `offline` — one is coming up, the other stopped answering, and telling a
 * business those are the same thing wastes their time.
 */
export function deviceState(device) {
  if (device.status === 'error') return { tone: 'error', label: 'Error' }
  if (device.status === 'provisioning') return { tone: 'pending', label: 'Starting up' }
  if (device.online) return { tone: 'online', label: 'Online' }
  if (device.stale) return { tone: 'error', label: 'Stopped responding' }
  return { tone: 'offline', label: 'Offline' }
}
