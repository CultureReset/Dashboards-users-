import { useCallback, useEffect, useMemo, useState } from 'react'
import { fetchCalendarMonth, blockDates, unblockDates, saveCapacity } from '../lib/calendar'

/**
 * Owner availability calendar.
 *
 * One month at a time, drawn from the same availability engine guests are told
 * about, so what the owner sees here is what a guest is shown. Tap a day, or a
 * start and an end day, to close those dates; tap again to re-open dates the
 * owner closed. Bookings and blocks that come from a synced calendar are shown
 * but are changed at their source.
 *
 * Nothing about the business is named here: every label, count and date comes
 * from the API.
 */

const STATUS = {
  available: { label: 'Open', glyph: '✓' },
  limited: { label: 'Almost full', glyph: '!' },
  full: { label: 'Full', glyph: '✕' },
  booked: { label: 'Booked', glyph: '●' },
  blocked: { label: 'Closed', glyph: '⛔' },
  unknown: { label: 'Not set', glyph: '–' },
}
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

const todayIso = () => new Date().toISOString().slice(0, 10)
const monthOf = (iso) => iso.slice(0, 7)
const shiftMonth = (month, delta) => {
  const [y, m] = month.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1 + delta, 1)).toISOString().slice(0, 7)
}
const monthTitle = (month) =>
  new Date(month + '-01T12:00:00Z').toLocaleDateString(undefined, { month: 'long', year: 'numeric', timeZone: 'UTC' })
const dayTitle = (iso) =>
  new Date(iso + 'T12:00:00Z').toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' })
const shortDay = (iso) =>
  new Date(iso + 'T12:00:00Z').toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' })
const rangeLabel = (a, b) => (a === b ? shortDay(a) : `${shortDay(a)} – ${shortDay(b)}`)

export default function AvailabilityCalendar() {
  const [month, setMonth] = useState(() => monthOf(todayIso()))
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [anchor, setAnchor] = useState(null) // first tap of a range, waiting for the second
  const [range, setRange] = useState(null) // { start, end }
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState('')
  const [message, setMessage] = useState('')
  const [capacity, setCapacity] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const payload = await fetchCalendarMonth(month)
      // A malformed answer (an empty body, an old API without this endpoint) must
      // become an error message, never a crash that blanks the whole dashboard.
      if (!payload || !Array.isArray(payload.days) || typeof payload.from !== 'string') {
        throw new Error('The calendar came back in a shape we did not expect.')
      }
      setData(payload)
      setCapacity(payload.daily_capacity == null ? '' : String(payload.daily_capacity))
    } catch (err) {
      setError(err.message || 'Could not load the calendar.')
    } finally {
      setLoading(false)
    }
  }, [month])

  useEffect(() => { load() }, [load])

  const go = (delta) => { setMonth((m) => shiftMonth(m, delta)); setRange(null); setAnchor(null); setMessage('') }
  const goToday = () => { setMonth(monthOf(todayIso())); setRange(null); setAnchor(null); setMessage('') }

  const onPick = (date) => {
    setMessage('')
    if (!anchor) {
      setAnchor(date)
      setRange({ start: date, end: date })
    } else {
      const [start, end] = anchor <= date ? [anchor, date] : [date, anchor]
      setRange({ start, end })
      setAnchor(null)
    }
  }

  const events = useMemo(() => (Array.isArray(data?.events) ? data.events : []), [data])
  const inRange = useMemo(() => {
    if (!range) return []
    return events.filter((e) => e.start <= range.end && e.last_day >= range.start)
  }, [events, range])
  const removable = inRange.filter((e) => e.removable)
  const synced = inRange.filter((e) => !e.removable)
  const isPast = range ? range.end < todayIso() : false

  const run = async (key, work, done) => {
    setBusy(key)
    setMessage('')
    try {
      await work()
      setMessage(done)
      setRange(null)
      setAnchor(null)
      setNote('')
      await load()
    } catch (err) {
      setMessage(err.message || 'That did not work. Try again.')
    } finally {
      setBusy('')
    }
  }

  const onBlock = () => run('block', () => blockDates({ date: range.start, end_date: range.end, note: note.trim() || undefined }),
    `Closed ${rangeLabel(range.start, range.end)}. Guests will see these dates as unavailable.`)
  const onUnblock = (event) => run(`un-${event.id}`, () => unblockDates(event.id),
    `Re-opened ${rangeLabel(event.start, event.last_day)}.`)
  const onSaveCapacity = () => {
    const trimmed = capacity.trim()
    return run('cap', () => saveCapacity(trimmed === '' ? null : Number(trimmed)),
      trimmed === '' ? 'Capacity cleared.' : `Saved. Guests can now book up to ${trimmed} per day.`)
  }

  const grid = useMemo(() => {
    if (!data) return []
    const offset = new Date(data.from + 'T12:00:00Z').getUTCDay()
    return [...Array.from({ length: offset }, () => null), ...data.days]
  }, [data])

  const today = todayIso()
  const selected = (date) => range && date >= range.start && date <= range.end

  return (
    <section className="avail" aria-label="Availability calendar">
      <div className="avail-head">
        <div className="avail-nav">
          <button type="button" className="secondary" onClick={() => go(-1)} aria-label="Previous month">‹</button>
          <h3 aria-live="polite">{monthTitle(month)}</h3>
          <button type="button" className="secondary" onClick={() => go(1)} aria-label="Next month">›</button>
        </div>
        <button type="button" className="secondary" onClick={goToday}>Today</button>
      </div>

      {data && !data.capacity_known ? (
        <p className="avail-notice" role="status">
          Guests can't see when you're free yet — we don't know how many you can host in a day.
          Set it below and open dates show up in search.
        </p>
      ) : null}

      <div className="avail-capacity">
        <label>
          How many can be booked per day?
          <input
            type="number"
            inputMode="numeric"
            min="1"
            max="1000"
            step="1"
            value={capacity}
            onChange={(e) => setCapacity(e.target.value)}
            placeholder="e.g. 1 for one condo, 8 for a boat"
          />
        </label>
        <button type="button" className="primary" disabled={busy === 'cap'} onClick={onSaveCapacity}>
          {busy === 'cap' ? 'Saving…' : 'Save'}
        </button>
      </div>

      {error ? (
        <p className="auth-error" role="alert">
          {error} <button type="button" className="secondary" onClick={load}>Try again</button>
        </p>
      ) : null}

      <ul className="avail-legend" aria-label="Legend">
        {['available', 'booked', 'blocked', 'limited', 'unknown'].map((k) => (
          <li key={k}><span className={`avail-swatch avail-${k}`} aria-hidden="true">{STATUS[k].glyph}</span>{STATUS[k].label}</li>
        ))}
      </ul>

      <div className={`avail-grid${loading ? ' is-loading' : ''}`} role="grid" aria-busy={loading}>
        {WEEKDAYS.map((d) => <div key={d} className="avail-dow" role="columnheader">{d}</div>)}
        {grid.map((day, i) => {
          if (!day) return <div key={`pad-${i}`} className="avail-pad" aria-hidden="true" />
          const s = STATUS[day.status] || STATUS.unknown
          const n = Number(day.date.slice(8))
          const count = day.total > 1 && day.remaining != null && (day.status === 'available' || day.status === 'limited')
            ? `${day.remaining} left` : ''
          return (
            <button
              key={day.date}
              type="button"
              role="gridcell"
              className={`avail-day avail-${day.status}${selected(day.date) ? ' is-selected' : ''}${day.date === today ? ' is-today' : ''}${day.date < today ? ' is-past' : ''}`}
              onClick={() => onPick(day.date)}
              aria-pressed={!!selected(day.date)}
              aria-label={`${dayTitle(day.date)}: ${s.label}${count ? `, ${count}` : ''}`}
            >
              <span className="avail-num">{n}</span>
              <span className="avail-glyph" aria-hidden="true">{s.glyph}</span>
              {count ? <span className="avail-count">{count}</span> : null}
            </button>
          )
        })}
      </div>

      {anchor ? <p className="claim-sub avail-hint" role="status">Now tap the last day to close a range, or tap the same day again for just one.</p> : null}
      {!range && !anchor ? <p className="claim-sub avail-hint">Tap a day to close it, or tap a first and last day for a range.</p> : null}

      {range ? (
        <div className="avail-panel" role="region" aria-label="Selected dates">
          <strong>{rangeLabel(range.start, range.end)}</strong>

          {synced.length ? (
            <ul className="avail-events">
              {synced.map((e) => (
                <li key={e.id}>
                  <span>{e.kind === 'booking' ? 'Booking' : 'Closed'} · {e.title || e.source} · {rangeLabel(e.start, e.last_day)}</span>
                  <span className="claim-sub">Comes from a synced calendar — change it there.</span>
                </li>
              ))}
            </ul>
          ) : null}

          {removable.map((e) => (
            <div key={e.id} className="avail-row">
              <span>You closed {rangeLabel(e.start, e.last_day)}{e.title && e.title !== 'Blocked by you' ? ` · ${e.title}` : ''}</span>
              <button type="button" className="secondary" disabled={busy === `un-${e.id}`} onClick={() => onUnblock(e)}>
                {busy === `un-${e.id}` ? 'Re-opening…' : 'Re-open'}
              </button>
            </div>
          ))}

          {isPast ? (
            <p className="claim-sub">These dates have already passed.</p>
          ) : (
            <div className="avail-block">
              <label>
                Note (only you see this)
                <input value={note} maxLength={140} onChange={(e) => setNote(e.target.value)} placeholder="Maintenance, family stay…" />
              </label>
              <button type="button" className="primary" disabled={busy === 'block'} onClick={onBlock}>
                {busy === 'block' ? 'Closing…' : `Close ${rangeLabel(range.start, range.end)}`}
              </button>
            </div>
          )}
          <button type="button" className="secondary" onClick={() => { setRange(null); setAnchor(null) }}>Clear selection</button>
        </div>
      ) : null}

      {message ? <p className="avail-message" role="status">{message}</p> : null}
    </section>
  )
}
