import { useCallback, useEffect, useState } from 'react'
import { fetchRateCalendar, setRateCalendar, clearRateCalendar, money } from '../lib/bookingApi'

/**
 * Nightly prices, set the way an owner actually thinks about them.
 *
 * Not a grid of 365 boxes. An owner says "August is $320 a night" and
 * "weekends are $400" and "we're closed the first week of December", so
 * the form takes a span, optionally narrowed to certain weekdays, and
 * writes the lot in one call.
 *
 * Only shown for products sold by the night. Everything else prices from
 * its rate rows and has no use for a calendar.
 */

const DAY_NAMES = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']

export default function BookingRates({ product, onChanged }) {
  const [days, setDays] = useState(null)
  const [error, setError] = useState('')
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7))

  const load = useCallback(async () => {
    try {
      const from = `${month}-01`
      const to = lastDayOf(month)
      const data = await fetchRateCalendar(product.id, from, to)
      setDays(data.days || [])
      setError('')
    } catch (err) {
      setError(err.message)
    }
  }, [product.id, month])

  useEffect(() => { load() }, [load])

  const base = (product.rates || []).find((r) => r.pricing_mode === 'per_night')

  return (
    <section className="booking-section">
      <h4>Nightly prices</h4>
      <p className="booking-note">
        {base
          ? `Normally ${money(base.amount, product.currency)} a night. Set a season, a weekend rate or a closure below — anything you don't set stays at the normal rate.`
          : 'Add a price with "per night" above first, then set your seasons here.'}
      </p>

      {error && <p className="auth-error">{error}</p>}

      <SetSpan product={product} onDone={() => { load(); if (onChanged) onChanged() }} />

      <div className="booking-btn-row">
        <button type="button" className="booking-icon-btn" onClick={() => setMonth(shiftMonth(month, -1))} aria-label="Previous month">‹</button>
        <strong>{monthLabel(month)}</strong>
        <button type="button" className="booking-icon-btn" onClick={() => setMonth(shiftMonth(month, 1))} aria-label="Next month">›</button>
      </div>

      {!days ? (
        <div className="spinner" />
      ) : !days.length ? (
        <p className="booking-note">Nothing special set for {monthLabel(month)} — every night is the normal rate.</p>
      ) : (
        <MonthGrid month={month} days={days} product={product} onChanged={() => { load(); if (onChanged) onChanged() }} />
      )}
    </section>
  )
}

function SetSpan({ product, onDone }) {
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [price, setPrice] = useState('')
  const [minNights, setMinNights] = useState('')
  const [closed, setClosed] = useState(false)
  const [weekdays, setWeekdays] = useState([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState('')

  function toggleDay(index) {
    setWeekdays((current) =>
      current.includes(index) ? current.filter((d) => d !== index) : [...current, index].sort())
  }

  async function apply() {
    setBusy(true)
    setError('')
    setDone('')
    try {
      const body = { from, to: to || from }
      if (weekdays.length) body.days_of_week = weekdays
      if (price !== '') body.price = Number(price)
      if (minNights !== '') body.min_nights = Number(minNights)
      if (closed) body.closed = true
      if (price === '' && minNights === '' && !closed) {
        setError('Set a price, a minimum stay, or mark it closed.')
        setBusy(false)
        return
      }
      const result = await setRateCalendar(product.id, body)
      setDone(`${result.dates} night${result.dates === 1 ? '' : 's'} updated.`)
      onDone()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function clear() {
    if (!from) return
    setBusy(true)
    try {
      await clearRateCalendar(product.id, from, to || from)
      setDone('Back to the normal rate.')
      onDone()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="booking-schedule">
      <div className="booking-row">
        <label className="booking-field">
          <span>From</span>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label className="booking-field">
          <span>To</span>
          <input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} />
        </label>
      </div>

      <div className="booking-row">
        <label className="booking-field">
          <span>Price a night</span>
          <input type="number" min="0" step="1" value={price} placeholder="leave blank to keep"
            onChange={(e) => setPrice(e.target.value)} />
        </label>
        <label className="booking-field">
          <span>Minimum stay</span>
          <input type="number" min="1" step="1" value={minNights} placeholder="nights"
            onChange={(e) => setMinNights(e.target.value)} />
        </label>
      </div>

      <div>
        <span className="booking-lbl">Only these days (leave blank for all)</span>
        <div className="booking-days">
          {DAY_NAMES.map((name, index) => (
            <button
              key={name}
              type="button"
              className={`booking-day${weekdays.includes(index) ? ' on' : ''}`}
              onClick={() => toggleDay(index)}
            >
              {name}
            </button>
          ))}
        </div>
      </div>

      <label className="booking-check">
        <input type="checkbox" checked={closed} onChange={(e) => setClosed(e.target.checked)} />
        <span>Closed — don&apos;t take bookings on these nights</span>
      </label>

      {error && <p className="auth-error">{error}</p>}
      {done && <p className="booking-note booking-good">{done}</p>}

      <div className="booking-btn-row">
        <button type="button" className="booking-btn" disabled={busy || !from} onClick={apply}>
          {busy ? 'Saving…' : 'Apply'}
        </button>
        <button type="button" className="booking-btn booking-btn-ghost booking-btn-small" disabled={busy || !from} onClick={clear}>
          Reset to normal rate
        </button>
      </div>
    </div>
  )
}

/** The month at a glance: only the nights that differ from normal. */
function MonthGrid({ month, days, product }) {
  const byDate = Object.fromEntries(days.map((d) => [String(d.date).slice(0, 10), d]))
  const total = daysInMonth(month)

  return (
    <div className="booking-month">
      {Array.from({ length: total }, (_, i) => {
        const date = `${month}-${String(i + 1).padStart(2, '0')}`
        const row = byDate[date]
        if (!row) return <span key={date} className="booking-month-day" aria-hidden="true">{i + 1}</span>
        return (
          <span
            key={date}
            className={`booking-month-day set${row.closed ? ' closed' : ''}`}
            title={[
              date,
              row.closed ? 'Closed' : null,
              row.price != null ? `${money(row.price, product.currency)} a night` : null,
              row.min_nights ? `${row.min_nights}-night minimum` : null,
            ].filter(Boolean).join(' · ')}
          >
            <strong>{i + 1}</strong>
            {row.closed
              ? <em>closed</em>
              : row.price != null
                ? <em>{Math.round(Number(row.price))}</em>
                : <em>{row.min_nights}n</em>}
          </span>
        )
      })}
    </div>
  )
}

/* ── dates ──────────────────────────────────────────────────────────── */

function daysInMonth(month) {
  const [year, m] = month.split('-').map(Number)
  return new Date(Date.UTC(year, m, 0)).getUTCDate()
}
function lastDayOf(month) {
  return `${month}-${String(daysInMonth(month)).padStart(2, '0')}`
}
function shiftMonth(month, delta) {
  const [year, m] = month.split('-').map(Number)
  const d = new Date(Date.UTC(year, m - 1 + delta, 1))
  return d.toISOString().slice(0, 7)
}
function monthLabel(month) {
  const [year, m] = month.split('-').map(Number)
  return new Date(Date.UTC(year, m - 1, 1))
    .toLocaleDateString(undefined, { month: 'long', year: 'numeric', timeZone: 'UTC' })
}
