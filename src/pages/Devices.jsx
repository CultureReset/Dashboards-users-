import { useCallback, useEffect, useState } from 'react'
import {
  fetchDevices, fetchHosts, enrolHost, removeHost, renameDevice,
  openSession, closeSession, deviceState, deviceName,
} from '../lib/devices'

// The business's own phones, plugged into a Linux box, shown live.
//
// Nothing on this page creates a phone. You enrol the computer; its agent
// reports whatever is plugged into it. That is why "+ Add" enrols a host and
// not a device — a phone that is not on the end of a cable should never appear
// here just because someone typed its name.
//
// The session token is held in component state only. Refreshing ends the
// viewer's access, which is the intended trade: nothing that can drive a phone
// belongs in storage.

const POLL_MS = 15000

export default function Devices() {
  const [devices, setDevices] = useState([])
  const [hosts, setHosts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState('')
  const [live, setLive] = useState(null)      // { id, mode, streamUrl, token }
  const [enrolled, setEnrolled] = useState(null) // { name, token } shown once
  const [adding, setAdding] = useState(false)

  const load = useCallback(async () => {
    try {
      const [d, h] = await Promise.all([fetchDevices(), fetchHosts()])
      setDevices(d)
      setHosts(h)
      setError('')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  // Heartbeats are what make any of this true, so re-read while the page is
  // open. Pausing on a hidden tab keeps a forgotten window from polling all day.
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
    setBusy(device.id); setError('')
    try {
      const res = await openSession(device.id, mode)
      setLive({ id: device.id, mode, streamUrl: res.stream_url, token: res.token })
      await load()
    } catch (err) {
      setError(err.message)
    } finally { setBusy('') }
  }

  async function stop(device) {
    setBusy(device.id)
    try {
      await closeSession(device.id)
      setLive((c) => (c && c.id === device.id ? null : c))
      await load()
    } catch (err) { setError(err.message) } finally { setBusy('') }
  }

  async function addHost(name) {
    setBusy('new')
    try {
      const res = await enrolHost(name)
      setEnrolled({ name: res.host.name, token: res.enrolment_token })
      setAdding(false)
      await load()
    } catch (err) { setError(err.message) } finally { setBusy('') }
  }

  async function dropHost(host) {
    if (!window.confirm(`Remove ${host.name}? Its phones disappear from here. The hardware is untouched.`)) return
    setBusy(host.id)
    try { await removeHost(host.id); await load() }
    catch (err) { setError(err.message) } finally { setBusy('') }
  }

  async function rename(device) {
    const label = window.prompt('Call this phone:', deviceName(device))
    if (label === null) return
    setBusy(device.id)
    try { await renameDevice(device.id, label); await load() }
    catch (err) { setError(err.message) } finally { setBusy('') }
  }

  if (loading) return <div className="devices-loading">Loading devices…</div>

  return (
    <div className="devices">
      <header className="devices-head">
        <div>
          <h2>Devices</h2>
          <p>Your own phones, plugged into a computer at your counter, on screen here.</p>
        </div>
        <button className="btn" onClick={() => setAdding((v) => !v)}>
          {adding ? 'Cancel' : '+ Add a computer'}
        </button>
      </header>

      {error && <div className="devices-error" role="alert">{error}</div>}

      {enrolled && (
        <div className="device-token">
          <strong>{enrolled.name} is ready to enrol.</strong>
          <p>Put this in the agent config on that machine. It is shown once and cannot be read again.</p>
          <code className="device-token-value">{enrolled.token}</code>
          <button className="btn btn--quiet" onClick={() => setEnrolled(null)}>Done</button>
        </div>
      )}

      {adding && <AddHost busy={busy === 'new'} onAdd={addHost} />}

      {hosts.length > 0 && (
        <ul className="host-list">
          {hosts.map((h) => (
            <li key={h.id} className={`host host--${h.online ? 'online' : 'offline'}`}>
              <span className="host-name">{h.name}</span>
              <span className="host-meta">
                {h.online
                  ? `${devices.filter((d) => d.host_id === h.id && d.status === 'attached').length} plugged in`
                  : h.status === 'enrolling' ? 'Waiting for the agent to check in' : 'Not answering'}
              </span>
              {h.os && <span className="host-os">{h.os}</span>}
              <button className="btn btn--quiet" disabled={busy === h.id} onClick={() => dropHost(h)}>Remove</button>
            </li>
          ))}
        </ul>
      )}

      {hosts.length === 0 && !adding && (
        <p className="devices-empty">
          No computer enrolled yet. Add one, run the agent on it, and any phone you plug in shows up here by itself.
        </p>
      )}

      {hosts.length > 0 && devices.length === 0 && (
        <p className="devices-empty">
          Nothing plugged in yet. Connect a phone by USB and turn on USB debugging.
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
            onRename={rename}
          />
        ))}
      </ul>
    </div>
  )
}

function DeviceCard({ device, live, busy, onWatch, onStop, onRename }) {
  const state = deviceState(device)
  const canOpen = state.tone === 'online' && !device.session

  return (
    <li className={`device device--${state.tone}`}>
      <div className="device-screen">
        {live ? (
          <iframe
            className="device-stream"
            title={`${deviceName(device)} screen`}
            src={`${live.streamUrl}#token=${encodeURIComponent(live.token)}&mode=${live.mode}`}
          />
        ) : (
          <div className="device-screen-idle">
            {state.tone === 'online' ? 'Screen off — open a session to watch' : state.label}
          </div>
        )}
      </div>

      <div className="device-body">
        <div className="device-title">
          <h3>{deviceName(device)}</h3>
          <span className={`device-badge device-badge--${state.tone}`}>{state.label}</span>
        </div>

        <dl className="device-facts">
          <dt>Serial</dt><dd className="mono">{device.serial}</dd>
          {device.model && (<><dt>Model</dt><dd>{[device.manufacturer, device.model].filter(Boolean).join(' ')}</dd></>)}
          {device.android_version && (<><dt>Android</dt><dd>{device.android_version}</dd></>)}
          <dt>Plugged into</dt><dd>{device.host_name || '—'}</dd>
          <dt>Last seen</dt><dd>{relative(device.last_seen_at)}</dd>
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

        {state.fix && <p className="device-hint">{state.fix}</p>}

        <div className="device-actions">
          {device.session || live ? (
            <button className="btn btn--danger" disabled={busy} onClick={() => onStop(device)}>End session</button>
          ) : (
            <>
              <button className="btn btn--primary" disabled={!canOpen || busy} onClick={() => onWatch(device, 'view')}>Watch</button>
              <button className="btn" disabled={!canOpen || busy} onClick={() => onWatch(device, 'control')}>Take control</button>
            </>
          )}
          <button className="btn btn--quiet" disabled={busy} onClick={() => onRename(device)}>Rename</button>
        </div>
      </div>
    </li>
  )
}

function AddHost({ busy, onAdd }) {
  const [name, setName] = useState('')

  function submit(event) {
    event.preventDefault()
    if (name.trim()) onAdd(name.trim())
  }

  return (
    <form className="device-add" onSubmit={submit}>
      <label>
        What do you call that computer?
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Back Office Linux" autoFocus />
      </label>
      <button className="btn btn--primary" type="submit" disabled={busy || !name.trim()}>
        {busy ? 'Enrolling…' : 'Enrol it'}
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
