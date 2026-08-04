import { useEffect, useMemo, useState } from 'react'
import {
  fetchAppStore,
  connectTool,
  refreshTool,
  disconnectTool,
  groupByCategory,
  searchTools,
} from '../lib/appStore'

// Connect your tools.
//
// Composio brokers the OAuth, so there are no keys to paste and nothing for a
// business to configure: pick a tool, authorise it on the provider's own
// screen, come back. Hundreds of toolkits arrive from one integration, which
// is why this screen is a search box and categories rather than a fixed list.
//
// Connecting opens the provider in a new tab. When focus returns, the status
// is reconciled with Composio — the OAuth redirect lands on Composio, not
// here, so nothing tells this page it finished except the owner coming back.

const ALL = '__all__'
const CONNECTED_TONES = { connected: 'ok', pending: 'pending', disconnected: 'off' }

export default function AppStore() {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState(ALL)
  const [busyTool, setBusyTool] = useState(null)
  const [awaiting, setAwaiting] = useState(null)

  const load = () =>
    fetchAppStore()
      .then((d) => { setData(d); setError('') })
      .catch((err) => setError(err.message))

  useEffect(() => { load() }, [])

  // The provider's OAuth screen opens in another tab and redirects to
  // Composio, so this page never hears that it worked. Coming back is the
  // signal — reconcile then.
  useEffect(() => {
    if (!awaiting) return
    const onFocus = async () => {
      try {
        await refreshTool(awaiting)
        await load()
      } catch { /* leave it pending; the owner can retry */ }
      setAwaiting(null)
      setBusyTool(null)
    }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [awaiting])

  const tools = data?.tools || []
  const connectedCount = tools.filter((t) => t.connection?.status === 'connected').length

  const groups = useMemo(() => groupByCategory(tools, data?.categories), [tools, data])

  const visible = useMemo(() => {
    const inCategory = category === ALL ? tools : tools.filter((t) => (t.cat || 'other') === category)
    return searchTools(inCategory, query)
  }, [tools, category, query])

  async function connect(tool) {
    setBusyTool(tool.tool_id)
    setError('')
    try {
      const { redirect_url, status } = await connectTool(tool.tool_id)
      if (redirect_url) {
        window.open(redirect_url, '_blank', 'noopener')
        setAwaiting(tool.tool_id)
        return // focus handler finishes it
      }
      if (status === 'connected') await load()
      setBusyTool(null)
    } catch (err) {
      setError(err.hint ? `${err.message} ${err.hint}` : err.message)
      setBusyTool(null)
    }
  }

  async function disconnect(tool) {
    setBusyTool(tool.tool_id)
    setError('')
    try {
      await disconnectTool(tool.tool_id)
      await load()
    } catch (err) { setError(err.message) } finally { setBusyTool(null) }
  }

  if (error && !data) {
    return (
      <div className="panel">
        <h2>Connect your tools</h2>
        <p className="auth-error">{error}</p>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="dashboard-loading">
        <div className="spinner" />
        <span>Loading tools…</span>
      </div>
    )
  }

  return (
    <div className="panel">
      <h2>Connect your tools</h2>
      <p className="claim-sub">
        {connectedCount > 0
          ? `${connectedCount} connected · ${tools.length} available`
          : `${tools.length} tools you can connect. Nothing to set up — you sign in on their site.`}
      </p>

      {!data.composio_configured && (
        <div className="similar-warning">
          <strong>Connecting isn&apos;t switched on yet</strong>
          <p>
            You can browse what&apos;s coming, but connecting is unavailable until
            the platform finishes setting it up.
          </p>
        </div>
      )}

      <input
        className="picker-search"
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={`Search ${tools.length} tools…`}
      />

      <div className="store-cats">
        <button
          className={`store-cat${category === ALL ? ' active' : ''}`}
          onClick={() => setCategory(ALL)}
        >
          All <span>{tools.length}</span>
        </button>
        {groups.map((g) => (
          <button
            key={g.key}
            className={`store-cat${category === g.key ? ' active' : ''}`}
            onClick={() => setCategory(g.key)}
          >
            {g.label} <span>{g.tools.length}</span>
          </button>
        ))}
      </div>

      {error && <p className="auth-error">{error}</p>}

      {visible.length === 0 ? (
        <p className="claim-empty">
          Nothing matches “{query}”.{' '}
          <button type="button" className="auth-switch" onClick={() => { setQuery(''); setCategory(ALL) }}>
            Clear
          </button>
        </p>
      ) : (
        <div className="store-grid">
          {visible.map((tool) => {
            const status = tool.connection?.status
            const busy = busyTool === tool.tool_id
            return (
              <div className={`store-card${status === 'connected' ? ' connected' : ''}`} key={tool.tool_id}>
                <div className="store-card-head">
                  {tool.logo ? (
                    <img className="store-logo" src={tool.logo} alt="" loading="lazy" />
                  ) : (
                    <span className="store-logo store-logo-fallback">{(tool.name || '?')[0]}</span>
                  )}
                  <div className="store-card-title">
                    <b>{tool.name}</b>
                    {status && <span className={`store-status ${CONNECTED_TONES[status] || ''}`}>{status}</span>}
                  </div>
                </div>
                {tool.description && <p className="store-desc">{tool.description}</p>}
                <div className="store-card-foot">
                  {status === 'connected' ? (
                    <button className="store-btn off" disabled={busy} onClick={() => disconnect(tool)}>
                      {busy ? '…' : 'Disconnect'}
                    </button>
                  ) : (
                    <button
                      className="store-btn primary"
                      disabled={busy || !data.composio_configured}
                      onClick={() => connect(tool)}
                    >
                      {busy ? (awaiting === tool.tool_id ? 'Waiting…' : '…') : status === 'pending' ? 'Finish connecting' : 'Connect'}
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
