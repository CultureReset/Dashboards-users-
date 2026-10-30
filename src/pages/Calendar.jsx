import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '../lib/AuthContext'
import {
  fetchCalendar,
  addIcalFeed,
  removeIcalFeed,
  syncIcalFeed,
  regenerateExportUrl,
} from '../lib/calendar'
import { fetchAppStore, connectTool, refreshTool } from '../lib/appStore'

/**
 * Owner Calendar — manage iCal import/export for every linked unit, and a
 * Connect apps strip (Google Calendar via Composio when configured; otherwise
 * a clearly marked stub).
 */
export default function Calendar() {
  const { gcrSlug, ownedSlugs, selectOwnerSlug } = useAuth()
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState('')
  const [form, setForm] = useState({ slug: gcrSlug || '', label: '', url: '', provider: '' })
  const [copied, setCopied] = useState('')
  const [apps, setApps] = useState(null)

  const load = useCallback(async () => {
    try {
      setError('')
      const overview = await fetchCalendar(gcrSlug || undefined)
      setData(overview)
      setForm((f) => ({
        ...f,
        slug: f.slug || overview.active_slug || gcrSlug || overview.units?.[0]?.slug || '',
      }))
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [gcrSlug])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    let cancelled = false
    fetchAppStore()
      .then((payload) => { if (!cancelled) setApps(payload) })
      .catch(() => { if (!cancelled) setApps(null) })
    return () => { cancelled = true }
  }, [gcrSlug])

  const googleTool = useMemo(() => {
    const tools = apps?.tools || []
    return tools.find((t) =>
      /google.?calendar/i.test(`${t.tool_id || ''} ${t.name || ''} ${t.composio_app || ''}`)
    ) || null
  }, [apps])

  const editableUnits = (data?.units || []).filter((u) => u.can_edit)

  async function onAdd(e) {
    e.preventDefault()
    if (!form.url.trim()) return
    setBusy('add')
    setError('')
    try {
      if (form.slug && form.slug !== gcrSlug && selectOwnerSlug) selectOwnerSlug(form.slug)
      await addIcalFeed(
        {
          ical_url: form.url.trim(),
          source_label: form.label.trim() || 'External Calendar',
          provider: form.provider.trim() || undefined,
        },
        form.slug || undefined,
      )
      setForm((f) => ({ ...f, label: '', url: '', provider: '' }))
      await load()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy('')
    }
  }

  async function onRemove(unitSlug, feedId) {
    setBusy(`rm-${feedId}`)
    setError('')
    try {
      await removeIcalFeed(feedId, unitSlug)
      await load()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy('')
    }
  }

  async function onSync(unitSlug, feedId) {
    setBusy(`sync-${feedId}`)
    setError('')
    try {
      await syncIcalFeed(feedId, unitSlug)
      await load()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy('')
    }
  }

  async function onCopy(url, key) {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(key)
      setTimeout(() => setCopied(''), 1800)
    } catch {
      setError('Could not copy — select the link and copy manually.')
    }
  }

  async function onRotate(unitSlug) {
    setBusy(`rot-${unitSlug}`)
    setError('')
    try {
      await regenerateExportUrl(unitSlug)
      await load()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy('')
    }
  }

  async function onConnectGoogle() {
    if (!googleTool) return
    setBusy('google')
    setError('')
    try {
      const { redirect_url, status } = await connectTool(googleTool.tool_id)
      if (redirect_url) {
        window.open(redirect_url, '_blank', 'noopener')
        const onFocus = async () => {
          try { await refreshTool(googleTool.tool_id) } catch { /* */ }
          try { setApps(await fetchAppStore()) } catch { /* */ }
        }
        window.addEventListener('focus', onFocus, { once: true })
      } else if (status === 'connected') {
        setApps(await fetchAppStore())
      }
    } catch (err) {
      setError(err.hint ? `${err.message} ${err.hint}` : err.message)
    } finally {
      setBusy('')
    }
  }

  if (loading) {
    return (
      <div className="calendar-page">
        <p className="claim-sub">Loading calendar…</p>
      </div>
    )
  }

  return (
    <div className="calendar-page">
      <header className="calendar-header">
        <h2>Calendar</h2>
        <p className="claim-sub">
          Import blocked dates from Airbnb, VRBO, and other iCal feeds. Export your GCR
          calendar so those platforms stay in sync. Counts still come from booking emails —
          iCal is block-only (yes/no).
        </p>
      </header>

      {error ? <p className="auth-error">{error}</p> : null}

      {(ownedSlugs?.length > 1 || editableUnits.length > 1) && (
        <label className="calendar-slug-picker">
          Active unit
          <select
            value={gcrSlug || ''}
            onChange={(e) => selectOwnerSlug?.(e.target.value)}
          >
            {(ownedSlugs?.length ? ownedSlugs : editableUnits.map((u) => ({ slug: u.slug, name: u.name }))).map((s) => (
              <option key={s.slug} value={s.slug}>{s.name || s.slug}</option>
            ))}
          </select>
        </label>
      )}

      <section className="calendar-section">
        <h3>Your units</h3>
        {!editableUnits.length ? (
          <p className="claim-sub">No linked units yet. An admin needs to link your account to a slug.</p>
        ) : (
          editableUnits.map((unit) => (
            <article key={unit.slug} className="calendar-unit-card">
              <div className="calendar-unit-head">
                <strong>{unit.name || unit.slug}</strong>
                {unit.unit_number ? <span className="chip">#{unit.unit_number}</span> : null}
                <code className="calendar-slug">{unit.slug}</code>
              </div>

              <div className="calendar-export">
                <span className="calendar-label">Export iCal (paste into Airbnb / VRBO / Google)</span>
                {unit.export_url ? (
                  <div className="calendar-export-row">
                    <input readOnly value={unit.export_url} />
                    <button type="button" className="secondary" onClick={() => onCopy(unit.export_url, unit.slug)}>
                      {copied === unit.slug ? 'Copied' : 'Copy'}
                    </button>
                    <button
                      type="button"
                      className="secondary"
                      disabled={busy === `rot-${unit.slug}`}
                      onClick={() => onRotate(unit.slug)}
                    >
                      Rotate link
                    </button>
                  </div>
                ) : (
                  <p className="claim-sub">Export link unavailable for this unit.</p>
                )}
              </div>

              <div className="calendar-feeds">
                <span className="calendar-label">Import feeds</span>
                {(unit.feeds || []).length === 0 ? (
                  <p className="claim-sub">No import feeds yet.</p>
                ) : (
                  <ul className="calendar-feed-list">
                    {unit.feeds.map((feed) => (
                      <li key={feed.id}>
                        <div>
                          <strong>{feed.source_label || feed.provider || 'Feed'}</strong>
                          <div className="calendar-feed-meta">
                            <a href={feed.ical_url} target="_blank" rel="noreferrer">Open source</a>
                            {feed.last_sync_status ? <span>{feed.last_sync_status}</span> : null}
                            {feed.last_synced_at ? (
                              <span>Last sync {new Date(feed.last_synced_at).toLocaleString()}</span>
                            ) : null}
                          </div>
                        </div>
                        <div className="calendar-feed-actions">
                          <button
                            type="button"
                            className="secondary"
                            disabled={busy === `sync-${feed.id}`}
                            onClick={() => onSync(unit.slug, feed.id)}
                          >
                            {busy === `sync-${feed.id}` ? 'Syncing…' : 'Re-sync now'}
                          </button>
                          <button
                            type="button"
                            className="danger-ghost"
                            disabled={busy === `rm-${feed.id}`}
                            onClick={() => onRemove(unit.slug, feed.id)}
                          >
                            Remove
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </article>
          ))
        )}
      </section>

      <section className="calendar-section">
        <h3>Add iCal import link</h3>
        <form className="calendar-add-form" onSubmit={onAdd}>
          {editableUnits.length > 1 ? (
            <label>
              Unit
              <select
                value={form.slug}
                onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))}
              >
                {editableUnits.map((u) => (
                  <option key={u.slug} value={u.slug}>{u.name || u.slug}</option>
                ))}
              </select>
            </label>
          ) : null}
          <label>
            Label
            <input
              value={form.label}
              onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
              placeholder="Airbnb"
            />
          </label>
          <label>
            Provider (optional)
            <input
              value={form.provider}
              onChange={(e) => setForm((f) => ({ ...f, provider: e.target.value }))}
              placeholder="airbnb / vrbo / google"
            />
          </label>
          <label>
            iCal URL
            <input
              value={form.url}
              onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))}
              placeholder="https://…"
              required
            />
          </label>
          <button type="submit" className="primary" disabled={busy === 'add'}>
            {busy === 'add' ? 'Adding…' : 'Add feed'}
          </button>
        </form>
      </section>

      <section className="calendar-section">
        <h3>Connect apps</h3>
        <p className="claim-sub">
          Connect Google Calendar and other tools so availability stays aligned.
        </p>
        {googleTool && apps?.composio_configured ? (
          <div className="calendar-connect-card">
            <div>
              <strong>{googleTool.name || 'Google Calendar'}</strong>
              <p className="claim-sub">{googleTool.description || 'Sync via Composio OAuth.'}</p>
              {googleTool.connection?.status === 'connected' ? (
                <span className="chip">Connected</span>
              ) : null}
            </div>
            <button
              type="button"
              className="primary"
              disabled={busy === 'google' || googleTool.connection?.status === 'connected'}
              onClick={onConnectGoogle}
            >
              {googleTool.connection?.status === 'connected' ? 'Connected' : 'Connect Google Calendar'}
            </button>
          </div>
        ) : (
          <div className="calendar-connect-card stub">
            <div>
              <strong>Google Calendar</strong>
              <p className="claim-sub">
                {apps && !apps.composio_configured
                  ? 'OAuth is not switched on yet (Composio). This is a stub until connecting is enabled.'
                  : 'Google Calendar is not in the App Store catalogue yet. Stub — use iCal import/export above, or open Tools when Google is listed.'}
              </p>
              <span className="chip">Stub</span>
            </div>
            <button type="button" className="secondary" disabled>
              Coming soon
            </button>
          </div>
        )}
      </section>
    </div>
  )
}
