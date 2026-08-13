import { useCallback, useEffect, useMemo, useState } from 'react'
import api from '../lib/apiClient'
import endpoints from '../lib/endpoints'

/**
 * Availability — the one screen where a business controls its own inventory.
 *
 * Everywhere else in this dashboard the business describes itself: its menu,
 * its hours, its photos. This screen is different, because the number it
 * governs is one the platform has been changing on the owner's behalf. The
 * email parser subtracts a party size from capacity on every confirmation it
 * reads, and until now that was a one-way street — if it missed a
 * cancellation, the seat was gone and the owner had no way to put it back.
 *
 * So the screen is built around correction rather than data entry:
 *
 *   - what the public currently sees is shown first, and labelled as such,
 *     because that is the thing the owner is actually worried about
 *   - the capacity behind it is editable in one field
 *   - any single day can be corrected without inventing or deleting a booking
 *   - closing a day is its own action, kept distinct from being fully booked,
 *     because they mean different things to a customer
 */

const DAY_MS = 86400000

function iso(d) {
  return new Date(d).toISOString().slice(0, 10)
}

function addDays(dateStr, n) {
  return iso(new Date(dateStr + 'T00:00:00Z').getTime() + n * DAY_MS)
}

function prettyDate(dateStr) {
  return new Date(dateStr + 'T00:00:00Z').toLocaleDateString(undefined, {
    weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC',
  })
}

const STATUS_LABEL = {
  available: 'Open',
  limited: 'Almost gone',
  full: 'Booked',
  blocked: 'Closed',
  unknown: 'Not tracked',
}

export default function AvailabilitySection() {
  const today = useMemo(() => iso(Date.now()), [])
  const [from, setFrom] = useState(today)
  const [to, setTo] = useState(() => addDays(iso(Date.now()), 13))

  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState('')

  const [capacityDraft, setCapacityDraft] = useState('')
  const [editing, setEditing] = useState(null)      // { date, booked }

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await api.get(endpoints.availability.range(from, to))
      setData(res)
      setCapacityDraft(res.daily_capacity == null ? '' : String(res.daily_capacity))
    } catch (err) {
      // A dashboard that has never had capacity set is a normal state, not a
      // failure — only say something went wrong when something did.
      setError(err.isMissingEndpoint
        ? 'Availability is not enabled on this account yet.'
        : (err.message || 'Could not load availability.'))
    } finally {
      setLoading(false)
    }
  }, [from, to])

  useEffect(() => { load() }, [load])

  // Merge the public view with the raw rows so each date shows both what the
  // customer sees and the number behind it.
  const days = useMemo(() => {
    if (!data) return []
    const rawByDate = new Map()
    for (const row of data.days || []) {
      // Day-level rows only; a business with per-slot rows still gets a
      // sensible daily total from the first one.
      if (!rawByDate.has(row.availability_date)) rawByDate.set(row.availability_date, row)
    }
    const blocked = new Set()
    for (const b of data.blocks || []) {
      let d = b.date
      const end = b.end_date || b.date
      while (d <= end) { blocked.add(d); d = addDays(d, 1) }
    }
    return (data.public_view || []).map((pv) => ({
      date: pv.date,
      status: blocked.has(pv.date) ? 'blocked' : (pv.status || 'unknown'),
      remaining: pv.remaining,
      total: pv.total,
      assumed: pv.assumed,
      raw: rawByDate.get(pv.date) || null,
      blocked: blocked.has(pv.date),
      blockId: (data.blocks || []).find((b) => {
        const end = b.end_date || b.date
        return pv.date >= b.date && pv.date <= end
      })?.id || null,
    }))
  }, [data])

  async function saveCapacity() {
    setBusy('capacity'); setNotice(''); setError('')
    try {
      const value = capacityDraft.trim() === '' ? null : Number(capacityDraft)
      await api.put(endpoints.availability.capacity(), { daily_capacity: value })
      setNotice(value == null
        ? 'Capacity cleared. Your page now says "call to confirm".'
        : `Capacity set to ${value}.`)
      await load()
    } catch (err) {
      setError(err.message || 'Could not save capacity.')
    } finally {
      setBusy('')
    }
  }

  async function saveDay(date, booked) {
    setBusy(date); setNotice(''); setError('')
    try {
      await api.put(endpoints.availability.day(), { date, booked_count: Number(booked) })
      setNotice(`${prettyDate(date)} updated.`)
      setEditing(null)
      await load()
    } catch (err) {
      setError(err.message || 'Could not update that day.')
    } finally {
      setBusy('')
    }
  }

  async function closeDate(date) {
    setBusy(date); setNotice(''); setError('')
    try {
      await api.post(endpoints.availability.block(), { date, title: 'Closed' })
      setNotice(`${prettyDate(date)} marked closed.`)
      await load()
    } catch (err) {
      setError(err.message || 'Could not close that date.')
    } finally {
      setBusy('')
    }
  }

  async function reopenDate(date, blockId) {
    setBusy(date); setNotice(''); setError('')
    try {
      await api.del(endpoints.availability.unblock(blockId))
      setNotice(`${prettyDate(date)} reopened.`)
      await load()
    } catch (err) {
      setError(err.message || 'Could not reopen that date.')
    } finally {
      setBusy('')
    }
  }

  if (loading && !data) {
    return (
      <section className="panel">
        <h2>Availability</h2>
        <p className="muted">Loading…</p>
      </section>
    )
  }

  return (
    <section className="panel availability">
      <h2>Availability</h2>

      {error && <p className="error">{error}</p>}
      {notice && <p className="notice">{notice}</p>}

      {/* ── capacity ─────────────────────────────────────────────── */}
      <div className="availability__capacity">
        <label htmlFor="daily-capacity">
          How many can you take in a day?
        </label>
        <div className="availability__caprow">
          <input
            id="daily-capacity"
            type="number"
            min="0"
            inputMode="numeric"
            value={capacityDraft}
            placeholder="Not set"
            onChange={(e) => setCapacityDraft(e.target.value)}
          />
          <button
            type="button"
            onClick={saveCapacity}
            disabled={busy === 'capacity'}
          >
            {busy === 'capacity' ? 'Saving…' : 'Save'}
          </button>
        </div>
        <p className="muted small">
          {data?.capacity_known
            ? 'Every booking we read from your confirmation emails counts down from this number.'
            : 'Until you set this, your page tells customers to call and confirm — which is the honest answer, just a slower one.'}
        </p>
      </div>

      {/* ── date range ───────────────────────────────────────────── */}
      <div className="availability__range">
        <label>
          From
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label>
          To
          <input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} />
        </label>
      </div>

      {/* ── the days ─────────────────────────────────────────────── */}
      <table className="availability__table">
        <thead>
          <tr>
            <th>Date</th>
            <th>What customers see</th>
            <th>Booked</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {days.map((d) => (
            <tr key={d.date} className={`availability__row is-${d.status}`}>
              <td>{prettyDate(d.date)}</td>
              <td>
                <span className={`pill pill--${d.status}`}>
                  {STATUS_LABEL[d.status] || d.status}
                </span>
                {d.remaining != null && !d.blocked && (
                  <span className="muted small"> {d.remaining} left</span>
                )}
                {d.assumed && !d.blocked && (
                  <span className="muted small" title="No bookings recorded for this date yet">
                    {' '}· assumed
                  </span>
                )}
              </td>
              <td>
                {editing?.date === d.date ? (
                  <input
                    type="number"
                    min="0"
                    autoFocus
                    value={editing.booked}
                    onChange={(e) => setEditing({ date: d.date, booked: e.target.value })}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') saveDay(d.date, editing.booked)
                      if (e.key === 'Escape') setEditing(null)
                    }}
                  />
                ) : (
                  <span>{d.raw?.booked_count ?? 0}</span>
                )}
              </td>
              <td className="availability__actions">
                {editing?.date === d.date ? (
                  <>
                    <button
                      type="button"
                      onClick={() => saveDay(d.date, editing.booked)}
                      disabled={busy === d.date}
                    >
                      {busy === d.date ? 'Saving…' : 'Save'}
                    </button>
                    <button type="button" className="link" onClick={() => setEditing(null)}>
                      Cancel
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      className="link"
                      onClick={() => setEditing({ date: d.date, booked: String(d.raw?.booked_count ?? 0) })}
                    >
                      Correct
                    </button>
                    {d.blocked ? (
                      <button
                        type="button"
                        className="link"
                        disabled={busy === d.date || !d.blockId}
                        onClick={() => reopenDate(d.date, d.blockId)}
                      >
                        Reopen
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="link"
                        disabled={busy === d.date}
                        onClick={() => closeDate(d.date)}
                      >
                        Close
                      </button>
                    )}
                  </>
                )}
              </td>
            </tr>
          ))}
          {!days.length && (
            <tr>
              <td colSpan={4} className="muted">Nothing in this date range yet.</td>
            </tr>
          )}
        </tbody>
      </table>

      <p className="muted small">
        “Closed” is not the same as “booked”. A closed day tells customers you are
        shut; a booked day tells them you are full. Closing a date overrides
        everything else for that day, including anything imported from Airbnb or
        VRBO.
      </p>
    </section>
  )
}
