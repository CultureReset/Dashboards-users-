import { useCallback, useEffect, useState } from 'react'
import { api } from '../lib/apiClient'
import endpoints from '../lib/endpoints'

// The business's store: what the operator has made available to this
// business (free, its plan, or a grant), what it has installed, and updates.
//
// Nothing here decides what the business may have; /api/store does, from the
// session. A version that asks for access the business has not given is never
// installed without it saying yes here.

export default function Store() {
  const [items, setItems] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState('')
  const [asking, setAsking] = useState(null) // { item, verb, permissions }
  const [settingsFor, setSettingsFor] = useState(null)

  const load = useCallback(async () => {
    try {
      const { items: list } = await api.get(endpoints.store.list())
      setItems(list)
      setError('')
    } catch (err) {
      setError(err.status === 501 ? 'The store is not open yet.' : err.message)
      setItems([])
    }
  }, [])

  useEffect(() => { load() }, [load])

  async function take(item, verb, acceptPermissions = false) {
    setBusy(item.id)
    try {
      const path = verb === 'install' ? endpoints.store.install(item.id) : endpoints.store.update(item.id)
      await api.post(path, { accept_permissions: acceptPermissions })
      setAsking(null)
      await load()
    } catch (err) {
      if (err.status === 409 && Array.isArray(err.body?.permissions)) {
        setAsking({ item, verb, permissions: err.body.permissions })
      } else {
        setError(err.message)
      }
    } finally {
      setBusy('')
    }
  }

  async function act(item, verb) {
    setBusy(item.id)
    try {
      if (verb === 'uninstall') await api.del(endpoints.store.item(item.id))
      else await api.post(endpoints.store.status(item.id, verb))
      await load()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy('')
    }
  }

  if (!items) return <div className="panel store-page"><p className="claim-sub">Loading the store…</p></div>

  const installed = items.filter((i) => i.installed)
  const available = items.filter((i) => !i.installed && i.entitled && i.available)
  const updates = installed.filter((i) => i.update_available)

  return (
    <div className="panel store-page">
      <h2>Store</h2>
      <p className="claim-sub">What you can add to your business, and what you already have.</p>
      {error && <p className="error">{error}</p>}

      {asking && (
        <div className="panel store-consent">
          <h3>{asking.item.name} asks for access</h3>
          <p>To {asking.verb === 'install' ? 'install it' : 'update it'}, you are giving it:</p>
          <ul>{asking.permissions.map((p) => <li key={p}><code>{p}</code></li>)}</ul>
          <div className="store-actions">
            <button className="primary" disabled={busy === asking.item.id} onClick={() => take(asking.item, asking.verb, true)}>Allow and {asking.verb}</button>
            <button onClick={() => setAsking(null)}>Not now</button>
          </div>
        </div>
      )}

      {updates.length > 0 && <p className="store-note">{updates.length} update{updates.length === 1 ? '' : 's'} ready.</p>}

      <h3>Yours</h3>
      {installed.length === 0 && <p className="claim-sub">Nothing installed yet.</p>}
      <ul className="store-list">
        {installed.map((item) => (
          <li key={item.id} className={`store-card${item.installed.status === 'disabled' ? ' off' : ''}`}>
            <StoreHead item={item} />
            <div className="store-meta">
              {item.installed.semver || `v${item.installed.version}`}
              {item.installed.status === 'disabled' && ' · switched off'}
              {!item.entitled && ' · no longer in your plan'}
            </div>
            {item.update_available && (
              <div className="store-banner">
                <span>
                  {item.available.semver} is ready{item.available.changelog ? `: ${item.available.changelog}` : ''}
                  {item.new_permissions.length > 0 && ` (asks for ${item.new_permissions.join(', ')})`}
                </span>
                <button disabled={busy === item.id} onClick={() => take(item, 'update')}>Update</button>
              </div>
            )}
            <div className="store-actions">
              {item.installed.status === 'disabled'
                ? <button disabled={busy === item.id} onClick={() => act(item, 'enable')}>Switch on</button>
                : <button disabled={busy === item.id} onClick={() => act(item, 'disable')}>Switch off</button>}
              {item.installed.settings.length > 0 && (
                <button onClick={() => setSettingsFor(settingsFor === item.id ? null : item.id)}>Settings</button>
              )}
              <button disabled={busy === item.id} onClick={() => act(item, 'uninstall')}>Remove</button>
            </div>
            {settingsFor === item.id && <Settings item={item} onSaved={load} />}
          </li>
        ))}
      </ul>

      <h3>Available to you</h3>
      {available.length === 0 && <p className="claim-sub">Nothing new for your business right now.</p>}
      <ul className="store-list">
        {available.map((item) => (
          <li key={item.id} className="store-card">
            <StoreHead item={item} />
            <div className="store-meta">
              {item.available.semver}
              {item.reason === 'plan' && ' · in your plan'}
              {item.reason === 'grant' && ' · given to you'}
              {item.reason === 'free' && ' · free'}
              {item.available.permissions.length > 0 && ` · asks for ${item.available.permissions.join(', ')}`}
            </div>
            <div className="store-actions">
              <button className="primary" disabled={busy === item.id} onClick={() => take(item, 'install')}>Install</button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

function StoreHead({ item }) {
  return (
    <div className="store-head">
      <span className="store-icon">{item.icon || '📦'}</span>
      <div className="store-title">
        <b>{item.name}</b>
        {item.summary && <span>{item.summary}</span>}
      </div>
    </div>
  )
}

function Settings({ item, onSaved }) {
  const [values, setValues] = useState(item.installed.config || {})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  async function save() {
    setSaving(true)
    try {
      await api.patch(endpoints.store.config(item.id), { config: values })
      setError('')
      await onSaved()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }
  return (
    <div className="store-settings">
      {item.installed.settings.map((key) => (
        <label key={key}>
          <span>{key.replace(/_/g, ' ')}</span>
          <input value={values[key] ?? ''} onChange={(e) => setValues({ ...values, [key]: e.target.value })} />
        </label>
      ))}
      {error && <p className="error">{error}</p>}
      <button className="primary" disabled={saving} onClick={save}>{saving ? 'Saving…' : 'Save'}</button>
    </div>
  )
}
