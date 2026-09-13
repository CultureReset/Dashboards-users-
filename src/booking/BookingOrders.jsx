import { useCallback, useEffect, useState } from 'react'
import {
  fetchOrders, fetchOrder, updateOrder, refundOrder,
  money, shortDate, shortTime, statusTone,
} from '../lib/bookingApi'

/**
 * The order book.
 *
 * Upcoming first, because that is what a business standing on a dock at six
 * in the morning needs: who is coming, how many, and have they paid. The
 * past is a filter away rather than the default view.
 */

const FILTERS = [
  { key: 'upcoming', label: 'Upcoming' },
  { key: 'all', label: 'All' },
  { key: 'pending', label: 'Needs attention' },
  { key: 'cancelled', label: 'Cancelled' },
]

export default function BookingOrders({ onChanged }) {
  const [orders, setOrders] = useState(null)
  const [filter, setFilter] = useState('upcoming')
  const [openId, setOpenId] = useState(null)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    try {
      const query =
        filter === 'upcoming' ? { upcoming: 'true' }
          : filter === 'all' ? {}
            : { status: filter }
      const data = await fetchOrders(query)
      setOrders(data.orders || [])
      setError('')
    } catch (err) {
      setError(err.message)
    }
  }, [filter])

  useEffect(() => { load() }, [load])

  function changed() {
    load()
    if (onChanged) onChanged()
  }

  return (
    <div className="booking-panel">
      <nav className="booking-filters">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            className={`booking-chip${filter === f.key ? ' on' : ''}`}
            onClick={() => { setFilter(f.key); setOpenId(null) }}
          >
            {f.label}
          </button>
        ))}
      </nav>

      {error && <p className="auth-error">{error}</p>}

      {!orders ? (
        <div className="booking-loading"><div className="spinner" /></div>
      ) : !orders.length ? (
        <p className="booking-empty">
          {filter === 'upcoming'
            ? 'Nothing booked yet. Once your trips are live and Stripe is connected, bookings land here.'
            : 'Nothing matching that filter.'}
        </p>
      ) : (
        <div className="booking-list">
          {orders.map((order) => (
            <OrderRow
              key={order.id}
              order={order}
              open={openId === order.id}
              onToggle={() => setOpenId(openId === order.id ? null : order.id)}
              onChanged={changed}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function OrderRow({ order, open, onToggle, onChanged }) {
  return (
    <article className="booking-card">
      <header className="booking-card-head">
        <button type="button" className="booking-card-title" onClick={onToggle}>
          <span className="booking-card-when">
            {shortDate(order.date)}
            {order.start_time && ` · ${shortTime(order.start_time)}`}
          </span>
          <span className="booking-card-name">{order.customer_name}</span>
          <span className="booking-card-meta">
            {order.party_size} guest{order.party_size === 1 ? '' : 's'}
            {order.total_amount != null && ` · ${money(order.total_amount, order.currency)}`}
            {order.confirmation_code && ` · ${order.confirmation_code}`}
          </span>
        </button>
        <div className="booking-card-actions">
          <span className={`booking-badge ${statusTone(order.status)}`}>{order.status}</span>
          <PaymentBadge order={order} />
          <button type="button" className="booking-card-expand" onClick={onToggle} aria-expanded={open}>
            {open ? '▲' : '▼'}
          </button>
        </div>
      </header>

      {open && <OrderDetail order={order} onChanged={onChanged} />}
    </article>
  )
}

function PaymentBadge({ order }) {
  const paid = Number(order.amount_paid || 0)
  const total = Number(order.total_amount || 0)

  if (order.payment_status === 'refunded') return <span className="booking-badge bad">refunded</span>
  if (order.payment_status === 'partially_refunded') return <span className="booking-badge warn">part refunded</span>
  if (!total) return null
  if (paid >= total) return <span className="booking-badge good">paid</span>
  if (paid > 0) {
    return (
      <span className="booking-badge warn" title={`${money(total - paid, order.currency)} due on the day`}>
        deposit
      </span>
    )
  }
  return <span className="booking-badge muted">unpaid</span>
}

function OrderDetail({ order, onChanged }) {
  const [detail, setDetail] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(() => {
    fetchOrder(order.id).then(setDetail).catch((err) => setError(err.message))
  }, [order.id])

  useEffect(() => { load() }, [load])

  async function setStatus(status) {
    setBusy(true)
    setError('')
    try {
      await updateOrder(order.id, { status })
      load()
      onChanged()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function refund() {
    const paid = Number(order.amount_paid || 0) - Number(order.refunded_amount || 0)
    const answer = prompt(
      `Refund how much? ${money(paid, order.currency)} is refundable.\n` +
      'Leave blank to use your cancellation policy.',
    )
    if (answer === null) return

    setBusy(true)
    setError('')
    try {
      const result = await refundOrder(order.id, answer.trim() ? { amount: Number(answer) } : {})
      alert(`Refunded ${money(result.refunded, order.currency)}.`)
      load()
      onChanged()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  if (!detail) {
    return <div className="booking-card-body"><div className="spinner" /></div>
  }

  const booking = detail.booking
  const canRefund = Number(booking.amount_paid || 0) > Number(booking.refunded_amount || 0)

  return (
    <div className="booking-card-body">
      {error && <p className="auth-error">{error}</p>}

      <section className="booking-section">
        <h4>Who</h4>
        <dl className="booking-facts">
          <div><dt>Name</dt><dd>{booking.customer_name}</dd></div>
          {booking.email && <div><dt>Email</dt><dd><a href={`mailto:${booking.email}`}>{booking.email}</a></dd></div>}
          {booking.phone && <div><dt>Phone</dt><dd><a href={`tel:${booking.phone}`}>{booking.phone}</a></dd></div>}
          <div><dt>Party</dt><dd>{booking.party_size}</dd></div>
          {booking.special_requests && <div><dt>Notes</dt><dd>{booking.special_requests}</dd></div>}
        </dl>

        {booking.answers && Object.keys(booking.answers).length > 0 && (
          <dl className="booking-facts">
            {Object.entries(booking.answers).map(([key, value]) => (
              <div key={key}><dt>{key.replace(/_/g, ' ')}</dt><dd>{String(value)}</dd></div>
            ))}
          </dl>
        )}
      </section>

      <section className="booking-section">
        <h4>What they paid</h4>
        <table className="booking-lines">
          <tbody>
            {detail.line_items.map((line) => (
              <tr key={line.id} className={line.kind === 'discount' ? 'booking-line-discount' : ''}>
                <td>{line.label}</td>
                <td className="booking-lines-qty">{Number(line.quantity) !== 1 ? `× ${line.quantity}` : ''}</td>
                <td className="booking-lines-amount">{money(line.amount, booking.currency)}</td>
              </tr>
            ))}
            <tr className="booking-lines-total">
              <td colSpan={2}>Total</td>
              <td className="booking-lines-amount">{money(booking.total_amount, booking.currency)}</td>
            </tr>
            <tr>
              <td colSpan={2}>Paid</td>
              <td className="booking-lines-amount">{money(booking.amount_paid, booking.currency)}</td>
            </tr>
            {Number(booking.balance_due) > 0 && (
              <tr>
                <td colSpan={2}>Due on the day</td>
                <td className="booking-lines-amount">{money(booking.balance_due, booking.currency)}</td>
              </tr>
            )}
            {Number(booking.refunded_amount) > 0 && (
              <tr>
                <td colSpan={2}>Refunded</td>
                <td className="booking-lines-amount">−{money(booking.refunded_amount, booking.currency)}</td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <section className="booking-section">
        <h4>Actions</h4>
        <div className="booking-btn-row">
          {booking.status !== 'confirmed' && (
            <button type="button" className="booking-btn" disabled={busy} onClick={() => setStatus('confirmed')}>
              Confirm
            </button>
          )}
          {booking.status !== 'completed' && (
            <button type="button" className="booking-btn booking-btn-ghost" disabled={busy} onClick={() => setStatus('completed')}>
              Mark done
            </button>
          )}
          {booking.status !== 'cancelled' && (
            <button type="button" className="booking-btn booking-btn-ghost" disabled={busy} onClick={() => setStatus('cancelled')}>
              Cancel
            </button>
          )}
          {canRefund && (
            <button type="button" className="booking-btn booking-btn-danger" disabled={busy} onClick={refund}>
              Refund
            </button>
          )}
        </div>

        {detail.manage_url && (
          <p className="booking-note">
            The customer&apos;s own link:{' '}
            <a href={detail.manage_url} target="_blank" rel="noreferrer">view or cancel</a>
            {' '}— it went out with their confirmation.
          </p>
        )}
      </section>
    </div>
  )
}
