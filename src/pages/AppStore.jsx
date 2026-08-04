import { useCallback, useEffect, useState } from 'react'
import AppStoreView from '../components/AppStoreView'
import { fetchAppStore, connectTool, refreshTool, disconnectTool } from '../lib/appStore'

// The business's side of the App Store.
//
// AppStoreView renders it; this file only supplies the data and the actions.
// The admin console mounts the same view with a different set of actions.
//
// Connecting runs one at a time, in the order they were picked. The provider's
// OAuth screen redirects to Composio and never back here, so nothing tells
// this page it finished — the tab regaining focus is the signal, and that is
// when the status is reconciled and the next one offered.

export default function AppStore() {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [queue, setQueue] = useState(null) // { ids, at, onDone }

  const load = useCallback(async () => {
    try {
      setData(await fetchAppStore())
      setError('')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  // Coming back to the tab means they finished (or abandoned) the provider's
  // screen. Reconcile, then move on.
  useEffect(() => {
    if (!queue || queue.at >= queue.ids.length) return
    const onFocus = async () => {
      const id = queue.ids[queue.at]
      try { await refreshTool(id) } catch { /* leave it pending — they can retry */ }
      await load()
      setQueue((q) => (q ? { ...q, at: q.at + 1 } : null))
    }
    window.addEventListener('focus', onFocus, { once: true })
    return () => window.removeEventListener('focus', onFocus)
  }, [queue, load])

  // Nothing left in the run.
  useEffect(() => {
    if (queue && queue.at >= queue.ids.length) {
      queue.onDone?.()
      setQueue(null)
    }
  }, [queue])

  async function startQueue(ids, onDone) {
    setError('')
    setQueue({ ids, at: 0, onDone })
    await openNext(ids[0])
  }

  async function openNext(toolId) {
    try {
      const { redirect_url, status } = await connectTool(toolId)
      if (redirect_url) {
        window.open(redirect_url, '_blank', 'noopener')
        return
      }
      if (status === 'connected') await load()
    } catch (err) {
      setError(err.hint ? `${err.message} ${err.hint}` : err.message)
      setQueue(null)
    }
  }

  // Each time the run advances, open the next provider.
  useEffect(() => {
    if (queue && queue.at > 0 && queue.at < queue.ids.length) openNext(queue.ids[queue.at])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queue?.at])

  async function disconnect(tool) {
    setError('')
    try {
      await disconnectTool(tool.tool_id)
      await load()
    } catch (err) { setError(err.message) }
  }

  return (
    <AppStoreView
      title="Connect your tools"
      tools={data?.tools || []}
      categories={data?.categories || []}
      loading={loading}
      error={error}
      disabled={data ? !data.composio_configured : false}
      disabledReason="Connecting isn’t switched on yet. You can look through what’s coming — we’ll tell you when it’s ready."
      onConnectMany={startQueue}
      onDisconnect={disconnect}
      onRetry={load}
    />
  )
}
