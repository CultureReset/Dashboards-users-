import { useCallback, useEffect, useState } from 'react'
import {
  fetchSetupStatus,
  connectListing,
  removeConnection,
  requestUnitLink,
} from '../lib/ownerSetupApi'
import { useAuth } from '../lib/AuthContext'

/**
 * Owner Setup — connect Airbnb / VRBO listing + iCal.
 * Priority when linked_count === 0: link-request (admin must attach entity_owners).
 * When linked: paste iCal (+ optional listing URL) onto the active unit.
 */
export default function Setup() {
  const { gcrSlug, selectOwnerSlug } = useAuth()
  const [status, setStatus] = useState(null)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [busy, setBusy] = useState('')
  const [form, setForm] = useState({
    provider: 'airbnb',
    listing_url: '',
    ical_url: '',
    source_label: '',
    business_name: '',
    phone: '',
    entity_slug: '',
  })
  const [candidates, setCandidates] = useState([])

  const load = useCallback(async () => {
    setError('')
    try {
      const data = await fetchSetupStatus()
      setStatus(data)
      if (data.active_slug && selectOwnerSlug && data.active_slug !== gcrSlug) {
        // Keep session slug aligned when setup reports one; do not force if admin picker set it.
      }
    } catch (err) {
      setError(err.message)
    }
  }, [gcrSlug, selectOwnerSlug])

  useEffect(() => { load() }, [load])

  async function onConnect(e) {
    e.preventDefault()
    setBusy('connect')
    setError('')
    setInfo('')
    try {
      await connectListing({
        provider: form.provider,
        listing_url: form.listing_url.trim() || undefined,
        ical_url: form.ical_url.trim(),
        source_label: form.source_label.trim() || undefined,
      })
      setForm((f) => ({ ...f, listing_url: '', ical_url: '', source_label: '' }))
      setInfo('Connected. You can re-sync from Calendar.')
      await load()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy('')
    }
  }

  async function onLinkRequest(e) {
    e.preventDefault()
    setBusy('link')
    setError('')
    setInfo('')
    setCandidates([])
    try {
      const res = await requestUnitLink({
        provider: form.provider,
        listing_url: form.listing_url.trim() || undefined,
        ical_url: form.ical_url.trim() || undefined,
        business_name: form.business_name.trim() || undefined,
        phone: form.phone.trim(),
        entity_slug: form.entity_slug.trim() || undefined,
      })
      setCandidates(res.candidates || [])
      setInfo(res.note || 'Link request sent to staff.')
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy('')
    }
  }

  async function onRemove(id) {
    setBusy(`rm-${id}`)
    setError('')
    try {
      await removeConnection(id)
      await load()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy('')
    }
  }

  if (!status && !error) {
    return <div className="calendar-page"><p className="claim-sub">Loading setup…</p></div>
  }

  const needsLink = !!status?.needs_link

  return (
    <div className="calendar-page">
      <header className="calendar-header">
        <h2>Setup</h2>
        <p className="claim-sub">
          Connect your Airbnb or VRBO listing calendar so blocked dates stay in sync.
          {needsLink
            ? ' Your account has no linked unit yet — request a link below.'
            : ` Active unit: ${status?.active_slug || gcrSlug || '—'}.`}
        </p>
      </header>

      {error ? <p className="auth-error">{error}</p> : null}
      {info ? <p className="claim-sub">{info}</p> : null}

      <section className="calendar-section">
        <h3>{needsLink ? 'Request unit link' : 'Connect Airbnb / VRBO'}</h3>
        <form className="calendar-add-form" onSubmit={needsLink ? onLinkRequest : onConnect}>
          <label>
            Platform
            <select
              value={form.provider}
              onChange={(e) => setForm((f) => ({ ...f, provider: e.target.value }))}
            >
              <option value="airbnb">Airbnb</option>
              <option value="vrbo">VRBO</option>
              <option value="other">Other iCal</option>
            </select>
          </label>
          <label>
            Listing URL {needsLink ? '(optional but helpful)' : '(optional)'}
            <input
              type="url"
              placeholder={form.provider === 'vrbo' ? 'https://www.vrbo.com/…' : 'https://www.airbnb.com/rooms/…'}
              value={form.listing_url}
              onChange={(e) => setForm((f) => ({ ...f, listing_url: e.target.value }))}
            />
          </label>
          <label>
            iCal export URL {needsLink ? '(optional)' : ''}
            <input
              type="url"
              required={!needsLink}
              placeholder="https://…"
              value={form.ical_url}
              onChange={(e) => setForm((f) => ({ ...f, ical_url: e.target.value }))}
            />
          </label>
          {status?.help ? (
            <p className="claim-sub">
              {form.provider === 'vrbo' ? status.help.vrbo_ical : status.help.airbnb_ical}
            </p>
          ) : null}

          {needsLink ? (
            <>
              <label>
                Business / unit name
                <input
                  type="text"
                  value={form.business_name}
                  onChange={(e) => setForm((f) => ({ ...f, business_name: e.target.value }))}
                  placeholder="Unit 101, Beach Condo…"
                />
              </label>
              <label>
                Phone (required for staff verify)
                <input
                  type="tel"
                  required
                  value={form.phone}
                  onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                />
              </label>
              <label>
                Known slug (optional)
                <input
                  type="text"
                  value={form.entity_slug}
                  onChange={(e) => setForm((f) => ({ ...f, entity_slug: e.target.value }))}
                  placeholder="unit-101"
                />
              </label>
              <button type="submit" className="primary" disabled={busy === 'link'}>
                {busy === 'link' ? 'Sending…' : 'Request staff link'}
              </button>
            </>
          ) : (
            <>
              <label>
                Label (optional)
                <input
                  type="text"
                  value={form.source_label}
                  onChange={(e) => setForm((f) => ({ ...f, source_label: e.target.value }))}
                />
              </label>
              <button type="submit" className="primary" disabled={busy === 'connect'}>
                {busy === 'connect' ? 'Saving…' : 'Connect calendar'}
              </button>
            </>
          )}
        </form>
      </section>

      {candidates.length > 0 && (
        <section className="calendar-section">
          <h3>Possible matches</h3>
          <p className="claim-sub">Staff still has to confirm the link. Nothing was attached automatically.</p>
          <ul className="calendar-feed-list">
            {candidates.map((c) => (
              <li key={c.slug}>
                <div>
                  <strong>{c.name}</strong>
                  {c.unit_number ? <span className="chip">#{c.unit_number}</span> : null}
                  <div className="calendar-feed-meta">
                    <code>{c.slug}</code>
                    {c.booking_url ? <a href={c.booking_url} target="_blank" rel="noreferrer">Listing</a> : null}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {!needsLink && (
        <section className="calendar-section">
          <h3>Your connections</h3>
          {(status?.connections || []).length === 0 ? (
            <p className="claim-sub">No calendars connected yet.</p>
          ) : (
            <ul className="calendar-feed-list">
              {(status.connections || []).map((c) => (
                <li key={c.id}>
                  <div>
                    <strong>{c.source_label || c.provider}</strong>
                    <div className="calendar-feed-meta">
                      <span>{c.provider}</span>
                      <span>{c.entity_slug}</span>
                      {c.last_sync_status ? <span>{c.last_sync_status}</span> : null}
                    </div>
                  </div>
                  <div className="calendar-feed-actions">
                    <button
                      type="button"
                      className="danger-ghost"
                      disabled={busy === `rm-${c.id}`}
                      onClick={() => onRemove(c.id)}
                    >
                      Remove
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  )
}
