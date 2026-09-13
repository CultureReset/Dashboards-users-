/**
 * The booking platform, as a business sees it.
 *
 * Everything goes through gcr-api-clean at /api/booking. This file holds no
 * Stripe key, no Supabase key and no slug: which business a call acts on is
 * resolved server-side from the session through entity_owners, exactly as
 * the App Store and the section editors do it.
 *
 * There is also nothing here that computes a price. The engine quotes and
 * charges from the same server-side function; a number this dashboard
 * displayed would be a second opinion at best and a lie at worst.
 */

import { api } from './apiClient'
import { endpoints } from './endpoints'

const booking = endpoints.booking

/* ── setup ──────────────────────────────────────────────────────────── */

/**
 * The verticals on offer — fishing charter, parasailing, jet ski hire and
 * the rest. These are rows in the database, not a list in this file, so a
 * new one appears here the moment it is seeded.
 */
export const fetchTemplates = () => api.get(booking.templates())

/** Readiness, counts and the latest handful of bookings. */
export const fetchSummary = () => api.get(booking.summary())

/* ── products ───────────────────────────────────────────────────────── */

/** Every product with its rates, schedules and extras already attached. */
export const fetchProducts = () => api.get(booking.products())

/**
 * Create a product.
 *
 * With `template_id`, one call writes the product, its price tiers, its
 * extras and its opening hours — the whole "switch on parasailing" flow.
 * Without one, it makes a blank product to fill in by hand.
 */
export const createProduct = (body) => api.post(booking.products(), body)

export const updateProduct = (id, patch) => api.patch(booking.product(id), patch)

/**
 * Retire a product. The API deactivates rather than deletes when bookings
 * exist, so a past customer's receipt keeps its name and its price.
 */
export const deleteProduct = (id) => api.del(booking.product(id))

/* ── rates, schedules, extras, resources ────────────────────────────── */
//
// Four collections, identical verbs. One factory rather than sixteen
// near-identical exports — the API side is built the same way, for the same
// reason: four copies of a check drift until one of them is wrong.

function collection(name) {
  return {
    list: (productId) =>
      api.get(booking.collection(name), productId ? { query: { product_id: productId } } : undefined),
    create: (body) => api.post(booking.collection(name), body),
    update: (id, patch) => api.patch(booking.collectionItem(name, id), patch),
    remove: (id) => api.del(booking.collectionItem(name, id)),
  }
}

export const rates = collection('rates')
export const schedules = collection('schedules')
export const extras = collection('extras')
export const resources = collection('resources')

/* ── bookings ───────────────────────────────────────────────────────── */

/** The order book. Filters: from, to, status, product_id, upcoming. */
export const fetchOrders = (query) => api.get(booking.orders(), { query })

/** One booking with its line items, its payments and its manage link. */
export const fetchOrder = (id) => api.get(booking.order(id))

export const updateOrder = (id, patch) => api.patch(booking.order(id), patch)

/**
 * Refund a booking.
 *
 * Send no amount and the product's own cancellation policy decides, worked
 * out server-side. Send one and it is honoured — an owner refunding more
 * than their policy is giving away their own money, and a platform that
 * blocks that is just in the way.
 */
export const refundOrder = (id, body) => api.post(booking.refund(id), body || {})

/** Every date-claim in a window, from this engine and from every sync. */
export const fetchCalendar = (from, to) => api.get(booking.calendar(), { query: { from, to } })

/* ── payments ───────────────────────────────────────────────────────── */

/** Connect status: connected, charges enabled, what Stripe still wants. */
export const fetchPaymentAccount = () => api.get(booking.paymentAccount())

/**
 * Begin (or resume) Stripe onboarding.
 *
 * Returns a one-time hosted URL. Stripe collects the bank details and the
 * identity documents; none of it passes through this dashboard or the API,
 * which is the point — that data is a liability nobody here wants to hold.
 */
export const startOnboarding = (body) => api.post(booking.onboard(), body || {})

/** Re-read the account from Stripe after the owner comes back. */
export const refreshPaymentAccount = () => api.post(booking.refreshAccount(), {})

/** A link into the business's own Stripe dashboard for its payouts. */
export const stripeLoginLink = () => api.post(booking.stripeLogin(), {})

/* ── settings ───────────────────────────────────────────────────────── */

export const fetchSettings = () => api.get(booking.settings())
export const saveSettings = (body) => api.patch(booking.settings(), body)

/* ── display helpers ────────────────────────────────────────────────── */
//
// Formatting only. No arithmetic on money happens in this app.

export function money(amount, currency = 'usd') {
  const value = Number(amount)
  if (!Number.isFinite(value)) return '—'
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: currency.toUpperCase(),
    minimumFractionDigits: value % 1 === 0 ? 0 : 2,
  }).format(value)
}

/** '2030-07-04' → 'Thu 4 Jul'. Parsed as UTC so it never shifts a day. */
export function shortDate(value) {
  if (!value) return ''
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00Z`)
  if (Number.isNaN(date.getTime())) return String(value)
  return date.toLocaleDateString(undefined, {
    weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC',
  })
}

/** '06:00:00' → '6:00 AM'. Leaves anything unrecognisable alone. */
export function shortTime(value) {
  if (!value) return ''
  const match = String(value).match(/^(\d{1,2}):(\d{2})/)
  if (!match) return String(value)
  const hour = Number(match[1])
  const suffix = hour >= 12 ? 'PM' : 'AM'
  return `${((hour + 11) % 12) + 1}:${match[2]} ${suffix}`
}

/** How a booking's state should read, and which colour it earns. */
export function statusTone(status) {
  switch (status) {
    case 'confirmed': return 'good'
    case 'pending': return 'warn'
    case 'hold': return 'warn'
    case 'cancelled': return 'bad'
    case 'expired': return 'muted'
    case 'completed': return 'good'
    default: return 'muted'
  }
}

/** Plain English for the deposit rule on a product. */
export function depositLabel(product) {
  if (!product) return ''
  switch (product.deposit_mode) {
    case 'none': return 'No card needed — pay on the day'
    case 'full': return 'Paid in full at booking'
    case 'percent': return `${Number(product.deposit_value)}% deposit at booking`
    case 'amount': return `${money(product.deposit_value, product.currency)} deposit at booking`
    default: return ''
  }
}

/** Plain English for how a product's calendar works. */
export const SCHEDULE_MODES = {
  fixed_times: 'Set departure times',
  duration_slots: 'Rolling slots through the day',
  date_range: 'Check-in to check-out',
  open_date: 'A whole day, no time',
  request: 'Enquiry only — no calendar',
}

/** Plain English for what fills a slot up. */
export const CAPACITY_MODES = {
  seats: 'Seats shared by everyone on the departure',
  units: 'A count of machines, boards or carts',
  exclusive: 'One booking takes the whole slot',
}
