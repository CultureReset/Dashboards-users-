import { api } from './apiClient'
import { endpoints } from './endpoints'

// Automations, as a business sees them.
//
// The operator builds these in the admin console and pushes them here. The
// business does not build anything: it switches one on or off, fills in the
// few settings the automation asks for, runs it by hand if it wants to, and
// reads what each run did. Which business this is comes from the session,
// server-side — nothing here names a slug.

/** Everything pushed to this business. Returns { automations }. */
export const fetchAutomations = () => api.get(endpoints.automations.list())

/** Switch on/off, or save settings. Either key may be omitted. */
export const updateAutomation = (id, { enabled, config }) =>
  api.patch(endpoints.automations.update(id), { enabled, config })

/** Run it now. Returns { result } with a per-step log. */
export const runAutomation = (id, input) => api.post(endpoints.automations.run(id), { input })

/** The last runs for this business. Returns { runs }. */
export const fetchRuns = (id) => api.get(endpoints.automations.runs(id))

/** Move to the newest version the operator published. */
export const upgradeAutomation = (id) => api.post(endpoints.automations.upgrade(id), {})

/** A fresh webhook URL — the old one stops working. */
export const rotateHook = (id) => api.post(endpoints.automations.rotateHook(id), {})

/** Plain words for a trigger. */
export function describeTrigger(trigger) {
  if (!trigger) return 'Run by hand'
  if (trigger.type === 'schedule') {
    const at = trigger.at || '09:00'
    if (trigger.every === 'hour') return 'Runs every hour'
    if (trigger.every === 'week') {
      const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
      return `Runs every ${days[Number(trigger.day_of_week ?? 1)]} at ${at}`
    }
    return `Runs every day at ${at}`
  }
  if (trigger.type === 'event') return `Runs when: ${trigger.event || 'something happens'}`
  if (trigger.type === 'webhook') return 'Runs when its URL is called'
  return 'Run by hand'
}
