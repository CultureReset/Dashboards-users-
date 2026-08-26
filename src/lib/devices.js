import { api } from './apiClient'
import { endpoints } from './endpoints'

// The business's own Android phones, plugged into a Linux box at the counter.
//
//   phone --USB--> Linux host --> Docker container (adb + scrcpy) --> here
//
// Nothing here creates a phone. The host agent reports whatever `adb devices`
// returned and this dashboard shows that, so a phone can never appear in the
// UI when there is nothing on the end of the cable.
//
// A session token is returned exactly once. Hold it in component state for the
// life of the viewer; never write it to storage.

/** Every phone across every host this business owns. */
export async function fetchDevices() {
  return api.get(endpoints.devices.list())
}

/** One phone, with its host, its apps and any session already open. */
export async function fetchDevice(id) {
  return api.get(endpoints.devices.one(id))
}

/** The Linux boxes. A phone is always plugged into one of these. */
export async function fetchHosts() {
  return api.get(endpoints.devices.hosts())
}

/**
 * Enrol a Linux box. Returns `{ host, enrolment_token }` — the token goes in
 * the agent's config on that machine and is shown once. Phones appear on their
 * own once the agent starts heartbeating.
 */
export async function enrolHost(name) {
  return api.post(endpoints.devices.hosts(), { name })
}

/** Remove a host. Its phones go with it; the hardware is untouched. */
export async function removeHost(id) {
  return api.del(endpoints.devices.host(id))
}

/** Rename a phone. The adb serial is its identity; the label is for people. */
export async function renameDevice(id, label) {
  return api.patch(endpoints.devices.one(id), { label })
}

/** Open a viewing or controlling session. Token comes back once. */
export async function openSession(id, mode = 'view') {
  return api.post(endpoints.devices.session(id), { mode })
}

/** Close the live session. Safe when none is open. */
export async function closeSession(id) {
  return api.del(endpoints.devices.session(id))
}

/**
 * What the badge says, and what the owner should do about it.
 *
 * These are deliberately five different messages. "Not trusted" means walk
 * over and tap Allow on the phone. "Not plugged in" means find a cable. "Box
 * not answering" means the computer is the problem, not the phone. Collapsing
 * them into "offline" sends people to fix the wrong thing.
 */
export function deviceState(device) {
  if (!device.host_online) {
    return { tone: 'error', label: 'Box not answering', fix: 'The computer this phone is plugged into stopped checking in.' }
  }
  if (device.status === 'unauthorized') {
    return { tone: 'pending', label: 'Not trusted', fix: 'Unlock the phone and tap “Allow USB debugging”.' }
  }
  if (device.status === 'detached') {
    return { tone: 'offline', label: 'Not plugged in', fix: '' }
  }
  if (device.status === 'error') {
    return { tone: 'error', label: 'Error', fix: device.error_message || '' }
  }
  if (!device.stream_url) {
    return { tone: 'pending', label: 'Screen starting', fix: 'The container showing this screen is still coming up.' }
  }
  return { tone: 'online', label: 'Live', fix: '' }
}

/** A phone's own name for itself when nobody has labelled it. */
export function deviceName(device) {
  return device.label || device.model || device.serial
}
