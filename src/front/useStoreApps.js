import { useEffect, useState } from 'react'
import { api } from '../lib/apiClient'
import endpoints from '../lib/endpoints'

// The business's Store rows, for the launcher: which apps are installed.
//
// The same GET /api/store the Store and Setup screens already make. The API
// resolves the business from the session (or, for an admin "viewing as", from
// the acting slug apiClient attaches) — nothing here names one.
//
// Soft-fails: if the store is not open, or the call fails, the launcher still
// shows the business's data sections and core tiles. `loaded` lets the caller
// tell "no apps" from "not asked yet".
export default function useStoreApps(slug, reloadKey = 0) {
  const [state, setState] = useState({ items: [], loaded: false })

  useEffect(() => {
    let cancelled = false
    api.get(endpoints.store.list())
      .then((data) => {
        if (!cancelled) setState({ items: Array.isArray(data?.items) ? data.items : [], loaded: true })
      })
      .catch(() => {
        if (!cancelled) setState((prev) => ({ items: prev.items, loaded: true }))
      })
    return () => { cancelled = true }
  }, [slug, reloadKey])

  return state
}
