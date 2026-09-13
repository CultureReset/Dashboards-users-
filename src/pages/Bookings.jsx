import { useCallback, useEffect, useState } from 'react'
import { fetchSummary, fetchProducts, wordingFor } from '../lib/bookingApi'
import BookingProducts from '../booking/BookingProducts'
import BookingOrders from '../booking/BookingOrders'
import BookingPayments from '../booking/BookingPayments'
import BookingStart from '../booking/BookingStart'
import BookingChannels from '../booking/BookingChannels'
import '../booking/booking.css'

/**
 * The booking platform, inside the dashboard the business already uses.
 *
 * Tabs once it is running, and one screen before that. The order is the
 * order the work actually happens in:
 *
 *   Start     — nothing set up yet: pick what kind of business this is
 *   <what they sell> — the products, their prices, their hours, their seasons
 *   Bookings  — the order book
 *   Channels  — Airbnb and Vrbo, for the ones sold by the night
 *   Payments  — Stripe Connect, and where the money goes
 *
 * This page holds the readiness summary and the wording, and nothing else.
 * Each tab fetches its own data, so a slow order book never delays the
 * setup screen and a Stripe hiccup never blanks the product list.
 */

/**
 * The tabs, with the one label that has to follow the business.
 *
 * A charter operator has Trips; a beach house has Stays; a salon has
 * Sessions. "Trips" for everyone was the last piece of hardwiring left in
 * this app, and it read as wrong on most screens.
 *
 * Channels only appears once there is something to sync — it is
 * meaningless to a business that sells seats on its own boat.
 */
function tabsFor(wording, showChannels) {
  return [
    { key: 'products', label: wording.many, icon: wording.icon },
    { key: 'orders', label: 'Bookings', icon: '📋' },
    showChannels && { key: 'channels', label: 'Channels', icon: '🔗' },
    { key: 'payments', label: 'Payments', icon: '💳' },
  ].filter(Boolean)
}

export default function Bookings() {
  const [summary, setSummary] = useState(null)
  const [wording, setWording] = useState({ one: 'Booking', many: 'Bookings', verb: 'book', icon: '📅' })
  const [hasStays, setHasStays] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('products')

  const load = useCallback(async () => {
    try {
      const [next, catalogue] = await Promise.all([
        fetchSummary(),
        // What they sell decides what this screen calls things.
        fetchProducts().catch(() => ({ products: [] })),
      ])
      setSummary(next)
      const products = catalogue.products || []
      setWording(wordingFor(products))
      setHasStays(products.some((p) => p.schedule_mode === 'date_range'))
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
          <ReadyLine summary={summary} wording={wording} />
        </div>
        <nav className="booking-tabs">
          {tabsFor(wording, hasStays).map((t) => (
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

      {tab === 'products' && <BookingProducts onChanged={load} wording={wording} />}
      {tab === 'orders' && <BookingOrders onChanged={load} />}
      {tab === 'channels' && <BookingChannels wording={wording} />}
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
function ReadyLine({ summary, wording }) {
  if (summary.ready) {
    return (
      <p className="booking-sub booking-good">
        Taking bookings · {summary.products_active} {summary.products_active === 1 ? wording.one.toLowerCase() : wording.many.toLowerCase()} live
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
    return <p className="booking-sub booking-warn">Nothing is live yet — switch one on to start selling.</p>
  }

  return <p className="booking-sub">Almost ready.</p>
}
