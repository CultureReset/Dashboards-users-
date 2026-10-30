import { useCallback, useEffect, useState } from 'react'
import { songRequestApi } from './api'

/**
 * Owner settings + queue for Song Request.
 * Standalone — reads/writes shared slug data through /api/apps/song-request.
 */
export default function OwnerSettings({ slug }) {
  const [settings, setSettings] = useState(null)
  const [songs, setSongs] = useState([])
  const [queue, setQueue] = useState([])
  const [songDraft, setSongDraft] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    if (!slug) return
    try {
      const [s, list, q] = await Promise.all([
        songRequestApi.settings(slug),
        songRequestApi.songs(slug),
        songRequestApi.queue(slug),
      ])
      setSettings(s)
      setSongs(list || [])
      setQueue(q || [])
      setError('')
    } catch (err) {
      setError(err.message)
    }
  }, [slug])

  useEffect(() => { load() }, [load])

  async function saveSettings(e) {
    e.preventDefault()
    setSaving(true)
    try {
      const next = await songRequestApi.saveSettings(slug, {
        request_price: Number(settings.request_price) || 10,
        accepting: !!settings.accepting,
        cashapp_handle: settings.cashapp_handle || '',
        venmo_handle: settings.venmo_handle || '',
      })
      setSettings((prev) => ({ ...prev, ...next }))
      setError('')
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function addSong(e) {
    e.preventDefault()
    const title = songDraft.trim()
    if (!title) return
    const next = [...songs, { title, is_available: true }]
    setSaving(true)
    try {
      const saved = await songRequestApi.saveSongs(slug, next)
      setSongs(saved || next)
      setSongDraft('')
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function removeSong(id) {
    const next = songs.filter((s) => s.id !== id)
    setSaving(true)
    try {
      const saved = await songRequestApi.saveSongs(slug, next)
      setSongs(saved || next)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function mark(id, status) {
    try {
      await songRequestApi.setStatus(slug, id, status)
      await load()
    } catch (err) {
      setError(err.message)
    }
  }

  if (!settings) {
    return <div className="panel">{error || 'Loading song request…'}</div>
  }

  const groups = {
    new: queue.filter((r) => r.status === 'new' || r.request_status === 'submitted' || r.request_status === 'accepted'),
    played: queue.filter((r) => r.status === 'played' || r.request_status === 'played'),
    skipped: queue.filter((r) => r.status === 'skipped' || r.request_status === 'skipped'),
  }

  return (
    <div className="panel song-request-owner">
      <h2>Song Request</h2>
      {error ? <p className="claim-status">{error}</p> : null}

      <form onSubmit={saveSettings} className="stack" style={{ display: 'grid', gap: 12, maxWidth: 420 }}>
        <label>
          Default price ($)
          <input
            type="number"
            min="0"
            step="1"
            value={settings.request_price ?? 10}
            onChange={(e) => setSettings({ ...settings, request_price: e.target.value })}
          />
        </label>
        <label>
          <input
            type="checkbox"
            checked={settings.accepting !== false}
            onChange={(e) => setSettings({ ...settings, accepting: e.target.checked })}
          />{' '}
          Accepting requests
        </label>
        <label>
          Cash App handle
          <input
            value={settings.cashapp_handle || ''}
            onChange={(e) => setSettings({ ...settings, cashapp_handle: e.target.value })}
            placeholder="cashtag"
          />
        </label>
        <label>
          Venmo handle
          <input
            value={settings.venmo_handle || ''}
            onChange={(e) => setSettings({ ...settings, venmo_handle: e.target.value })}
            placeholder="username"
          />
        </label>
        <button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save settings'}</button>
      </form>

      <h3 style={{ marginTop: 24 }}>Song list</h3>
      <form onSubmit={addSong} style={{ display: 'flex', gap: 8, maxWidth: 420 }}>
        <input value={songDraft} onChange={(e) => setSongDraft(e.target.value)} placeholder="Add a song title" />
        <button type="submit">Add</button>
      </form>
      <ul>
        {songs.map((s) => (
          <li key={s.id || s.title}>
            {s.title}{' '}
            <button type="button" onClick={() => removeSong(s.id)}>Remove</button>
          </li>
        ))}
      </ul>

      <h3 style={{ marginTop: 24 }}>Queue</h3>
      {['new', 'played', 'skipped'].map((key) => (
        <div key={key} style={{ marginBottom: 16 }}>
          <strong style={{ textTransform: 'capitalize' }}>{key}</strong>
          <ul>
            {groups[key].map((r) => (
              <li key={r.id}>
                {r.song_title} — {r.fan_name}
                {r.guest_table ? ` · table ${r.guest_table}` : ''}
                {r.payment_status === 'paid' ? ' · paid' : ` · ${r.payment_status || 'pending'}`}
                {key === 'new' ? (
                  <>
                    {' '}
                    <button type="button" onClick={() => mark(r.id, 'played')}>Played</button>
                    <button type="button" onClick={() => mark(r.id, 'skipped')}>Skip</button>
                  </>
                ) : null}
              </li>
            ))}
            {!groups[key].length ? <li style={{ opacity: 0.6 }}>None</li> : null}
          </ul>
        </div>
      ))}
    </div>
  )
}
