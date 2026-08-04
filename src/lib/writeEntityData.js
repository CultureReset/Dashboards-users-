import { api } from './apiClient'
import { endpoints } from './endpoints'

// Every write in the dashboard goes through this one module.
//
// It used to hold the client half of a security model — stamping the slug on
// inserts, filtering updates and deletes by it — and hope the database
// enforced the same thing independently. It does not need to any more. The
// slug is not sent at all now: gcr-api-clean resolves it from the session and
// puts it in the WHERE clause itself, where nothing in the request can reach.
//
// That is why these functions lost their `slug` argument. There is no longer
// anywhere to put it, and no longer any point — the server was never going to
// believe it.

/** Turn an API failure into something worth showing an owner. */
function describe(error) {
  if (error?.isNotLinked) return 'This account is not linked to a business yet.'
  if (error?.isNetworkError) return 'Could not reach the server — check your connection.'
  return error?.message || 'Write failed'
}

export async function createRow(table, values) {
  try {
    const { row } = await api.post(endpoints.business.create(table), values)
    return row
  } catch (error) {
    throw new Error(describe(error))
  }
}

export async function updateRow(table, id, values) {
  try {
    const { row } = await api.patch(endpoints.business.update(table, id), values)
    return row
  } catch (error) {
    throw new Error(describe(error))
  }
}

export async function deleteRow(table, id) {
  try {
    await api.del(endpoints.business.remove(table, id))
  } catch (error) {
    throw new Error(describe(error))
  }
}

/** One section's rows, for refreshing after an edit without a full reload. */
export async function fetchRows(table, { limit = 200, offset = 0 } = {}) {
  const { rows = [] } = await api.get(endpoints.business.table(table), { query: { limit, offset } })
  return rows
}
