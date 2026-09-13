import { useEffect, useState } from 'react'
import { fetchTemplates, createProduct, money } from '../lib/bookingApi'

/**
 * The first screen: what kind of business is this?
 *
 * Every tile here is a row in booking_templates. Nothing in this file names
 * a vertical, lists one, or knows that fishing charters exist — seed a
 * "Horseback Rides" row in the database and it appears on this page, with
 * its own starting prices and hours, with no change to this code and no
 * deploy.
 *
 * Picking one is a single POST that writes the product, its price tiers,
 * its extras and its opening hours. Everything it creates is an ordinary
 * row the owner edits afterwards, so the template stops mattering the
 * moment it is used.
 */
export default function BookingStart({ onCreated }) {
  const [templates, setTemplates] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState('')

  useEffect(() => {
    fetchTemplates()
      .then((data) => setTemplates(data.templates || []))
      .catch((err) => setError(err.message))
  }, [])

  async function choose(template) {
    setBusy(template.id)
    setError('')
    try {
      await createProduct({ template_id: template.id })
      onCreated()
    } catch (err) {
      setError(err.message)
      setBusy('')
    }
  }

  if (error && !templates) {
    return (
      <div className="booking-panel">
        <p className="auth-error">Couldn&apos;t load the booking types: {error}</p>
      </div>
    )
  }

  if (!templates) {
    return (
      <div className="booking-loading">
        <div className="spinner" />
      </div>
    )
  }

  const groups = groupByCategory(templates)

  return (
    <div className="booking">
      <header className="booking-head booking-head-stacked">
        <h2>Take bookings</h2>
        <p className="booking-sub">
          Pick what you sell and we&apos;ll set up the calendar, the prices and the deposit rules to
          match. All of it is yours to change afterwards — and you can add more than one.
        </p>
        {error && <p className="auth-error">{error}</p>}
      </header>

      {groups.map((group) => (
        <section key={group.key} className="booking-group">
          <h3>{group.label}</h3>
          <div className="booking-template-grid">
            {group.templates.map((template) => (
              <button
                key={template.id}
                type="button"
                className="booking-template"
                disabled={!!busy}
                onClick={() => choose(template)}
              >
                <span className="booking-template-icon" aria-hidden="true">{template.icon || '📦'}</span>
                <span className="booking-template-name">{template.name}</span>
                <span className="booking-template-tag">{template.tagline}</span>
                <span className="booking-template-meta">{startingAt(template)}</span>
                {busy === template.id && <span className="booking-template-busy">Setting up…</span>}
              </button>
            ))}
          </div>
        </section>
      ))}

      <p className="booking-foot">
        Not quite any of these? Start with the closest one — every setting it makes is editable, and
        nothing about it is locked to that trade afterwards.
      </p>
    </div>
  )
}

/** "From $85 per person", read off the template's own starting rates. */
function startingAt(template) {
  const rates = (template.rate_template || []).filter((r) => r.active !== false && Number(r.amount) > 0)
  if (!rates.length) return 'Prices you set'
  const cheapest = rates.reduce((low, r) => (Number(r.amount) < Number(low.amount) ? r : low))
  const per = {
    per_person: 'per person',
    per_group: 'per group',
    per_unit: 'per unit',
    per_hour: 'per hour',
    per_day: 'per day',
    per_night: 'per night',
  }[cheapest.pricing_mode] || ''
  return `From ${money(cheapest.amount)} ${per}`.trim()
}

/**
 * Group the tiles by the category the rows carry.
 *
 * Labels for known categories, humanised for anything else — a category
 * seeded later renders with a sensible heading rather than falling into an
 * "Other" bucket or needing this file edited.
 */
const CATEGORY_LABELS = {
  water: 'On the water',
  land: 'Tours and lessons',
  service: 'Appointments and hire',
  attraction: 'Tickets and admission',
}

function groupByCategory(templates) {
  const groups = new Map()
  for (const template of templates) {
    const key = template.category || 'other'
    if (!groups.has(key)) {
      groups.set(key, { key, label: CATEGORY_LABELS[key] || humanize(key), templates: [] })
    }
    groups.get(key).templates.push(template)
  }
  return [...groups.values()]
}

function humanize(key) {
  return String(key).replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}
