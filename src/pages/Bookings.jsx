import { useCallback, useEffect, useState } from 'react'
import { fetchSummary } from '../lib/bookingApi'
import BookingProducts from '../booking/BookingProducts'
import BookingOrders from '../booking/BookingOrders'
import BookingPayments from '../booking/BookingPayments'
import BookingStart from '../booking/BookingStart'
import '../booking/booking.css'

/**
 * The booking platform, inside the dashboard the business already uses.
 *
 * Three tabs once it is running, and one screen before that. The order is
 * the order the work actually happens in:
 *
 *   Start     — nothing set up yet: pick what kind of business this is
 *   Trips     — the products, their prices, their hours
 *   Bookings  — the order book
 *   Payments  — Stripe Connect, and where the money goes
 *
 * This page holds the readiness summary and nothing else. Each tab fetches
 * its own data, so a slow order book never delays the setup screen and a
 * Stripe hiccup never blanks the trip list.
 */

const TABS = [
  { key: 'products', label: 'Trips', icon: '🎣' },
  { key: 'orders', label: 'Bookings', icon: '📋' },
  { key: 'payments', label: 'Payments', icon: '💳' },
]

export default function Bookings() {
  const [summary, setSummary] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('products')

  const load = useCallback(async () => {
    try {
      setSummary(await fetchSummary())
      setError('')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  if (loading) {
    return (
      <div className="booking-loading">
        <div className="spinner" />
        <span>Loading your booking setup…</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="booking-panel">
        <p className="auth-error">Couldn&apos;t load your booking setup: {error}</p>
        <button type="button" className="booking-btn" onClick={load}>Try again</button>
      </div>
    )
  }

  // Nothing set up at all: one screen, one decision. Tabs would only offer
  // three empty rooms to someone who has not chosen what they sell yet.
  if (!summary?.products_total) {
    return <BookingStart onCreated={() => { setTab('products'); load() }} />
  }

  return (
    <div className="booking">
      <header className="booking-head">
        <div>
          <h2>Bookings</h2>
          <ReadyLine summary={summary} />
        </div>
        <nav className="booking-tabs">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              className={`booking-tab${tab === t.key ? ' active' : ''}`}
              onClick={() => setTab(t.key)}
            >
              <span aria-hidden="true">{t.icon}</span> {t.label}
              {t.key === 'orders' && summary.upcoming_bookings > 0 && (
                <span className="booking-pill">{summary.upcoming_bookings}</span>
              )}
            </button>
          ))}
        </nav>
      </header>

      {tab === 'products' && <BookingProducts onChanged={load} />}
      {tab === 'orders' && <BookingOrders onChanged={load} />}
      {tab === 'payments' && <BookingPayments onChanged={load} />}
    </div>
  )
}

/**
 * One line saying whether this business can actually take a booking today.
 *
 * Deliberately specific about what is missing. "Not ready" tells an owner
 * nothing; "you have trips, but no way to be paid" tells them where to go.
 */
function ReadyLine({ summary }) {
  if (summary.ready) {
    return (
      <p className="booking-sub booking-good">
        Taking bookings · {summary.products_active} trip{summary.products_active === 1 ? '' : 's'} live
        {summary.upcoming_bookings > 0 && ` · ${summary.upcoming_bookings} upcoming`}
      </p>
    )
  }

  if (!summary.stripe_configured) {
    return (
      <p className="booking-sub booking-warn">
        Card payments aren&apos;t switched on for this platform yet. You can still set up trips and
        take bookings that are paid on the day.
      </p>
    )
  }

  if (!summary.payments.connected) {
    return (
      <p className="booking-sub booking-warn">
        Connect Stripe to take payments online — until then, bookings can only be paid on the day.
      </p>
    )
  }

  if (!summary.payments.charges_enabled) {
    return (
      <p className="booking-sub booking-warn">
        Stripe still needs a few details from you before it will release payments.
      </p>
    )
  }

  if (!summary.products_active) {
    return <p className="booking-sub booking-warn">No trips are live yet — switch one on to start selling.</p>
  }

  return <p className="booking-sub">Almost ready.</p>
}
