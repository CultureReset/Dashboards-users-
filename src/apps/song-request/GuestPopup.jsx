import { useEffect, useState } from 'react'
import { songRequestApi } from './api'

/**
 * Guest popup for Song Request. Owned by this app.
 * Surfaces: popup (default), and the same form can sit in a page/section/table QR.
 */
export default function GuestPopup({ slug, open, onClose, surface = 'popup' }) {
  const [catalog, setCatalog] = useState(null)
  const [songId, setSongId] = useState('')
  const [customSong, setCustomSong] = useState('')
  const [name, setName] = useState('')
  const [table, setTable] = useState('')
  const [message, setMessage] = useState('')
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open || !slug) return
    songRequestApi.catalog(slug)
      .then(setCatalog)
      .catch((err) => setError(err.message))
  }, [open, slug])

  if (!open) return null

  async function submit(e) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const body = {
        fan_name: name.trim(),
        guest_table: table.trim() || undefined,
        note: message.trim() || undefined,
      }
      if (songId) body.song_id = songId
      else body.song_title = customSong.trim()
      const res = await songRequestApi.createRequest(slug, body)
      setResult(res)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const shellStyle = surface === 'popup'
    ? {
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)',
        display: 'grid', placeItems: 'center', zIndex: 80, padding: 16,
      }
    : { padding: 16 }

  const cardStyle = {
    width: 'min(420px, 100%)', background: '#0b1220', color: '#f8fafc',
    borderRadius: 20, padding: 18, border: '1px solid rgba(255,255,255,.12)',
  }

  return (
    <div style={shellStyle} role="dialog" aria-modal={surface === 'popup'} onClick={surface === 'popup' ? onClose : undefined}>
      <div style={cardStyle} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
          <h2 style={{ margin: 0 }}>Request a Song</h2>
          {surface === 'popup' ? <button type="button" onClick={onClose}>Close</button> : null}
        </div>

        {!catalog && !error ? <p>Loading…</p> : null}
        {error ? <p>{error}</p> : null}

        {catalog && !result ? (
          <form onSubmit={submit} style={{ display: 'grid', gap: 10, marginTop: 12 }}>
            <p style={{ margin: 0, opacity: 0.8 }}>
              {catalog.accepting === false
                ? 'Requests are closed right now.'
                : `$${catalog.price} · put the REQ code in your Cash App / Venmo note.`}
            </p>
            <label>
              Pick a song
              <select value={songId} onChange={(e) => { setSongId(e.target.value); if (e.target.value) setCustomSong('') }}>
                <option value="">Type your own…</option>
                {(catalog.songs || []).map((s) => (
                  <option key={s.id} value={s.id}>{s.title}</option>
                ))}
              </select>
            </label>
            {!songId ? (
              <label>
                Song title
                <input value={customSong} onChange={(e) => setCustomSong(e.target.value)} required placeholder="Sweet Caroline" />
              </label>
            ) : null}
            <label>
              Your name
              <input value={name} onChange={(e) => setName(e.target.value)} required />
            </label>
            <label>
              Table
              <input value={table} onChange={(e) => setTable(e.target.value)} placeholder="12" />
            </label>
            <label>
              Message (optional)
              <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={2} />
            </label>
            <button type="submit" disabled={busy || catalog.accepting === false}>
              {busy ? 'Creating…' : `Request · $${catalog.price}`}
            </button>
          </form>
        ) : null}

        {result ? (
          <div style={{ marginTop: 12, display: 'grid', gap: 8 }}>
            <p><strong>Code:</strong> {result.req_code}</p>
            <p>Pay <strong>${result.amount}</strong> and put <strong>{result.req_code}</strong> in the note.</p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {result.payment?.cashapp_url ? <a href={result.payment.cashapp_url} target="_blank" rel="noreferrer">Pay with Cash App</a> : null}
              {result.payment?.venmo_url ? <a href={result.payment.venmo_url} target="_blank" rel="noreferrer">Pay with Venmo</a> : null}
            </div>
            <button type="button" onClick={onClose}>Done</button>
          </div>
        ) : null}
      </div>
    </div>
  )
}
