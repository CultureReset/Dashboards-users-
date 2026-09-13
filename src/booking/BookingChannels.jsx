import { useCallback, useEffect, useState } from 'react'
import {
  fetchChannels, createChannel, deleteChannel, syncChannel, fetchProducts,
} from '../lib/bookingApi'

/**
 * Airbnb, Vrbo and Booking.com, in both directions.
 *
 * The thing that ruins an owner's week is one night sold twice. This is
 * the screen that stops it: paste the calendar link from each place they
 * list, and hand each of those places a link back.
 *
 * Deliberately written for someone who has never heard of iCal. The word
 * appears once, in small text, and every instruction names the actual
 * menu path on the actual site.
 */

// Where to find the link on each platform. Data, not code — a channel
// that is not on this list still works perfectly, it just gets generic
// wording instead of a menu path.
const KNOWN = [
  { name: 'Airbnb', icon: '🏠', where: 'Listing → Availability → Sync calendars → Export calendar' },
  { name: 'Vrbo', icon: '🏡', where: 'Calendar → Import/Export → Export calendar' },
  { name: 'Booking.com', icon: '🔵', where: 'Rates & Availability → Sync calendars → Export' },
  { name: 'Google Calendar', icon: '📆', where: 'Settings → Integrate calendar → Secret address in iCal format' },
]

export default function BookingChannels({ wording }) {
  const [channels, setChannels] = useState(null)
  const [products, setProducts] = useState([])
  const [error, setError] = useState('')
  const [adding, setAdding] = useState(false)
  const [busy, setBusy] = useState('')

  const load = useCallback(async () => {
    try {
      const data = await fetchChannels()
      setChannels(data.channels || [])
      setError('')
    } catch (err) {
      setError(err.message)
    }
  }, [])

  useEffect(() => { load() }, [load])
  useEffect(() => { fetchProducts().then((d) => setProducts(d.products || [])).catch(() => {}) }, [])

  async function sync(id) {
    setBusy(id)
    setError('')
    try {
      const result = await syncChannel(id)
      if (!result.ok) setError(result.error || 'That sync failed.')
      await load()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy('')
    }
  }

  async function remove(channel) {
    if (!confirm(`Disconnect ${channel.name}? Dates it was holding will free up.`)) return
    setBusy(channel.id)
    try {
      await deleteChannel(channel.id)
      await load()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy('')
    }
  }

  if (!channels) {
    return <div className="booking-loading"><div className="spinner" /></div>
  }

  const imports = channels.filter((c) => c.direction === 'import')
  const exports_ = channels.filter((c) => c.direction === 'export')

  return (
    <div className="booking-panel">
      {error && <p className="auth-error">{error}</p>}

      <div className="booking-notice">
        <h4>Keep your calendars in step</h4>
        <p>
          If you also list on Airbnb, Vrbo or Booking.com, connect them here and a date booked in one
          place closes everywhere else. It checks every fifteen minutes or so — not instantly — so
          leave a little room on the day itself.
        </p>
      </div>

      <section className="booking-section">
        <h4>Bringing bookings in</h4>
        {!imports.length && (
          <p className="booking-note">
            Nothing connected yet. Add the places you list to stop double bookings.
          </p>
        )}
        {imports.map((channel) => (
          <ChannelRow
            key={channel.id}
            channel={channel}
            busy={busy === channel.id}
            onSync={() => sync(channel.id)}
            onRemove={() => remove(channel)}
          />
        ))}
      </section>

      {!!exports_.length && (
        <section className="booking-section">
          <h4>Sending your bookings out</h4>
          <p className="booking-note">
            Paste this link into the other site so it knows when you are booked here. It shows dates
            only — never a guest&apos;s name or details.
          </p>
          {exports_.map((channel) => (
            <ChannelRow
              key={channel.id}
              channel={channel}
              busy={busy === channel.id}
              onRemove={() => remove(channel)}
            />
          ))}
        </section>
      )}

      {adding ? (
        <AddChannel
          products={products}
          wording={wording}
          onCancel={() => setAdding(false)}
          onDone={() => { setAdding(false); load() }}
        />
      ) : (
        <button type="button" className="booking-btn booking-btn-ghost" onClick={() => setAdding(true)}>
          ＋ Connect a calendar
        </button>
      )}
    </div>
  )
}

function ChannelRow({ channel, busy, onSync, onRemove }) {
  const [copied, setCopied] = useState(false)
  const known = KNOWN.find((k) => k.name.toLowerCase() === String(channel.name).toLowerCase())

  async function copy() {
    try {
      await navigator.clipboard.writeText(channel.feed_url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard is blocked in some embedded browsers; the input below
      // is selectable, so this is a convenience and not the only way.
    }
  }

  return (
    <article className="booking-card">
      <header className="booking-card-head">
        <div className="booking-card-title">
          <span className="booking-card-name">
            {known?.icon || '🔗'} {channel.name}
          </span>
          <span className="booking-card-meta"><ChannelStatus channel={channel} /></span>
        </div>
        <div className="booking-card-actions">
          {onSync && (
            <button type="button" className="booking-btn booking-btn-small" disabled={busy} onClick={onSync}>
              {busy ? 'Checking…' : 'Check now'}
            </button>
          )}
          <button type="button" className="booking-icon-btn" disabled={busy} onClick={onRemove} aria-label="Disconnect">
            ✕
          </button>
        </div>
      </header>

      {channel.feed_url && (
        <div className="booking-card-body">
          <label className="booking-field">
            <span>Your link to paste into {channel.name}</span>
            <input readOnly value={channel.feed_url} onFocus={(e) => e.target.select()} />
          </label>
          <button type="button" className="booking-btn booking-btn-small" onClick={copy}>
            {copied ? 'Copied' : 'Copy link'}
          </button>
        </div>
      )}
    </article>
  )
}

/**
 * What happened last time we looked.
 *
 * A failure says what to do about it. "last_status: error" on its own
 * sends an owner to support; the message from the API names the actual
 * problem, so it is shown.
 */
function ChannelStatus({ channel }) {
  if (channel.last_status === 'error') {
    return <span className="booking-warn">Couldn&apos;t read it — {channel.last_error}</span>
  }
  if (!channel.last_synced_at) return <span>Not checked yet</span>
  const when = new Date(channel.last_synced_at)
  const minutes = Math.round((Date.now() - when.getTime()) / 60000)
  const ago = minutes < 1 ? 'just now'
    : minutes < 60 ? `${minutes} min ago`
      : minutes < 1440 ? `${Math.round(minutes / 60)} hr ago`
        : when.toLocaleDateString()
  return (
    <span>
      {channel.events_imported} booking{channel.events_imported === 1 ? '' : 's'} held · checked {ago}
    </span>
  )
}

function AddChannel({ products, onCancel, onDone }) {
  const [name, setName] = useState('Airbnb')
  const [direction, setDirection] = useState('import')
  const [url, setUrl] = useState('')
  const [productId, setProductId] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const known = KNOWN.find((k) => k.name === name)

  async function save() {
    setBusy(true)
    setError('')
    try {
      const result = await createChannel({
        name,
        direction,
        url: direction === 'import' ? url.trim() : undefined,
        product_id: productId || undefined,
      })
      if (result.sync && !result.sync.ok) {
        setError(`Connected, but couldn't read it yet: ${result.sync.error}`)
        setTimeout(onDone, 2500)
        return
      }
      onDone()
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  return (
    <div className="booking-add">
      <h4>Connect a calendar</h4>
      {error && <p className="auth-error">{error}</p>}

      <label className="booking-field">
        <span>Where is it?</span>
        <input
          list="gcr-channel-names"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Airbnb"
        />
        <datalist id="gcr-channel-names">
          {KNOWN.map((k) => <option key={k.name} value={k.name} />)}
        </datalist>
      </label>

      <label className="booking-field">
        <span>Which way?</span>
        <select value={direction} onChange={(e) => setDirection(e.target.value)}>
          <option value="import">Bring their bookings in (stops double bookings here)</option>
          <option value="export">Send my bookings out (stops double bookings there)</option>
        </select>
      </label>

      {direction === 'import' ? (
        <label className="booking-field">
          <span>Paste the calendar link</span>
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://www.airbnb.com/calendar/ical/12345.ics?s=..."
          />
          <small>
            {known
              ? `On ${known.name}: ${known.where}`
              : 'Look for "export calendar", "sync calendars" or "iCal link" on that site.'}
          </small>
        </label>
      ) : (
        <p className="booking-note">
          We&apos;ll make you a link to paste into {name}. It shows only which dates are taken.
        </p>
      )}

      {products.length > 1 && (
        <label className="booking-field">
          <span>Which one is this for?</span>
          <select value={productId} onChange={(e) => setProductId(e.target.value)}>
            <option value="">Everything</option>
            {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <small>Pick the specific listing if this calendar is only for one of them.</small>
        </label>
      )}

      <div className="booking-btn-row">
        <button
          type="button" className="booking-btn"
          disabled={busy || !name || (direction === 'import' && !url.trim())}
          onClick={save}
        >
          {busy ? 'Connecting…' : 'Connect'}
        </button>
        <button type="button" className="booking-btn booking-btn-ghost" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  )
}
