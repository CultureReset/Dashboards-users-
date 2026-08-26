import { useCallback, useEffect, useState } from 'react'
import {
  fetchDevices, openSession, closeSession, provisionDevice, removeDevice,
  kindLabel, deviceState,
} from '../lib/devices'

// The business's devices, and the live screen of whichever one they open.
//
// A session token comes back once from the API and is held here in component
// state only. Refreshing the page ends the viewer's access, which is the point:
// nothing that can drive a phone gets written to storage.
//
// Devices that stopped checking in are shown as "Stopped responding" rather
// than offline, because those need a restart and plain offline does not.

const KINDS = [
  { id: 'android-cloud', label: 'Cloud Android' },
  { id: 'browser', label: 'Browser worker' },
  { id: 'android-physical', label: 'Physical phone' },
]

const POLL_MS = 15000

export default function Devices() {
  const [devices, setDevices] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState('')          // device id currently acting
  const [live, setLive] = useState(null)        // { id, mode, streamUrl, token }
  const [adding, setAdding] = useState(false)

  const load = useCallback(async () => {
    try {
      setDevices(await fetchDevices())
      setError('')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  // Heartbeats are what make the state true, so re-read while the page is open.
  // Pausing on a hidden tab keeps a forgotten window from polling all day.
  useEffect(() => {
    const tick = () => { if (!document.hidden) load() }
    const timer = setInterval(tick, POLL_MS)
    document.addEventListener('visibilitychange', tick)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', tick)
    }
  }, [load])

  async function watch(device, mode) {
    setBusy(device.id)
    setError('')
    try {
      const res = await openSession(device.id, mode)
      setLive({ id: device.id, mode, streamUrl: res.stream_url, token: res.token })
      await load()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy('')
    }
  }

  async function stop(device) {
    setBusy(device.id)
    try {
      await closeSession(device.id)
      setLive((current) => (current && current.id === device.id ? null : current))
      await load()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy('')
    }
  }

  async function add(name, kind) {
    setBusy('new')
    try {
      await provisionDevice({ name, kind })
      setAdding(false)
      await load()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy('')
    }
  }

  async function remove(device) {
    if (!window.confirm(`Remove ${device.name}? Anything running on it stops.`)) return
    setBusy(device.id)
    try {
      await removeDevice(device.id)
      setLive((current) => (current && current.id === device.id ? null : current))
      await load()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy('')
    }
  }

  if (loading) return <div className="devices-loading">Loading devices…</div>

  return (
    <div className="devices">
      <header className="devices-head">
        <div>
          <h2>Devices</h2>
          <p>Your own phone and browser, running in the cloud, signed in as you.</p>
        </div>
        <button className="btn" onClick={() => setAdding((v) => !v)}>
          {adding ? 'Cancel' : '+ Add a device'}
        </button>
      </header>

      {error && <div className="devices-error" role="alert">{error}</div>}

      {adding && <AddDevice busy={busy === 'new'} onAdd={add} />}

      {devices.length === 0 && !adding && (
        <p className="devices-empty">
          No devices yet. Add a cloud Android and Ghost can act in apps that have no API.
        </p>
      )}

      <ul className="devices-list">
        {devices.map((device) => (
          <DeviceCard
            key={device.id}
            device={device}
            live={live && live.id === device.id ? live : null}
            busy={busy === device.id}
            onWatch={watch}
            onStop={stop}
            onRemove={remove}
          />
        ))}
      </ul>
    </div>
  )
}

function DeviceCard({ device, live, busy, onWatch, onStop, onRemove }) {
  const state = deviceState(device)
  const canOpen = state.tone === 'online' && !device.session

  return (
    <li className={`device device--${state.tone}`}>
      <div className="device-screen">
        {live ? (
          <iframe
            className="device-stream"
            title={`${device.name} screen`}
            src={`${live.streamUrl}#token=${encodeURIComponent(live.token)}&mode=${live.mode}`}
          />
        ) : (
          <div className="device-screen-idle">
            {state.tone === 'online'
              ? 'Screen off — open a session to watch'
              : state.label}
          </div>
        )}
      </div>

      <div className="device-body">
        <div className="device-title">
          <h3>{device.name}</h3>
          <span className={`device-badge device-badge--${state.tone}`}>{state.label}</span>
        </div>

        <dl className="device-facts">
          <dt>Kind</dt><dd>{kindLabel(device.kind)}</dd>
          <dt>Last check-in</dt><dd>{relative(device.last_seen_at)}</dd>
          {device.container_ref && (<><dt>Container</dt><dd className="mono">{device.container_ref}</dd></>)}
        </dl>

        {device.apps && device.apps.length > 0 && (
          <ul className="device-apps">
            {device.apps.map((app) => (
              <li key={app.package_name}>
                {app.label || app.package_name}
                {app.signed_in && <span className="device-signedin">signed in</span>}
              </li>
            ))}
          </ul>
        )}

        {device.error_message && <p className="device-problem">{device.error_message}</p>}

        <div className="device-actions">
          {device.session || live ? (
            <button className="btn btn--danger" disabled={busy} onClick={() => onStop(device)}>
              End session
            </button>
          ) : (
            <>
              <button className="btn btn--primary" disabled={!canOpen || busy} onClick={() => onWatch(device, 'view')}>
                Watch
              </button>
              <button className="btn" disabled={!canOpen || busy} onClick={() => onWatch(device, 'control')}>
                Take control
              </button>
            </>
          )}
          <button className="btn btn--quiet" disabled={busy} onClick={() => onRemove(device)}>
            Remove
          </button>
        </div>

        {state.tone === 'error' && (
          <p className="device-hint">Restart it before opening a session.</p>
        )}
      </div>
    </li>
  )
}

function AddDevice({ busy, onAdd }) {
  const [name, setName] = useState('')
  const [kind, setKind] = useState(KINDS[0].id)

  function submit(event) {
    event.preventDefault()
    if (name.trim()) onAdd(name.trim(), kind)
  }

  return (
    <form className="device-add" onSubmit={submit}>
      <label>
        Name
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Front Desk Android" autoFocus />
      </label>
      <label>
        Kind
        <select value={kind} onChange={(e) => setKind(e.target.value)}>
          {KINDS.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}
        </select>
      </label>
      <button className="btn btn--primary" type="submit" disabled={busy || !name.trim()}>
        {busy ? 'Starting…' : 'Add device'}
      </button>
    </form>
  )
}

/** "8 seconds ago" beats an ISO string when the question is whether it is alive. */
function relative(iso) {
  if (!iso) return 'never'
  const seconds = Math.round((Date.now() - Date.parse(iso)) / 1000)
  if (!Number.isFinite(seconds)) return 'never'
  if (seconds < 60) return `${Math.max(seconds, 0)} seconds ago`
  if (seconds < 3600) return `${Math.round(seconds / 60)} minutes ago`
  if (seconds < 86400) return `${Math.round(seconds / 3600)} hours ago`
  return `${Math.round(seconds / 86400)} days ago`
}
