import { useCallback, useEffect, useState } from 'react'
import {
  fetchProducts, fetchTemplates, createProduct, updateProduct, deleteProduct,
  rates as ratesApi, extras as extrasApi, schedules as schedulesApi,
  money, depositLabel, SCHEDULE_MODES, CAPACITY_MODES,
} from '../lib/bookingApi'
import BookingRates from './BookingRates'

/**
 * The trips, their prices and their hours.
 *
 * One editor for every kind of business. A fishing charter and a hair
 * appointment are the same form with different values in it, because on the
 * server they are the same row — so this file names no vertical either. The
 * only thing that changes between them is which words the labels use, and
 * those come from the product's own schedule_mode.
 */
export default function BookingProducts({ onChanged, wording }) {
  const [products, setProducts] = useState(null)
  const [templates, setTemplates] = useState([])
  const [openId, setOpenId] = useState(null)
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    try {
      const data = await fetchProducts()
      setProducts(data.products || [])
      setError('')
    } catch (err) {
      setError(err.message)
    }
  }, [])

  useEffect(() => { load() }, [load])
  useEffect(() => { fetchTemplates().then((d) => setTemplates(d.templates || [])).catch(() => {}) }, [])

  function changed() {
    load()
    if (onChanged) onChanged()
  }

  if (!products) {
    return <div className="booking-loading"><div className="spinner" /></div>
  }

  return (
    <div className="booking-panel">
      {error && <p className="auth-error">{error}</p>}

      <div className="booking-list">
        {products.map((product) => (
          <ProductCard
            key={product.id}
            product={product}
            open={openId === product.id}
            onToggle={() => setOpenId(openId === product.id ? null : product.id)}
            onChanged={changed}
            wording={wording}
          />
        ))}
      </div>

      {adding ? (
        <AddProduct
          templates={templates}
          wording={wording}
          onCancel={() => setAdding(false)}
          onDone={() => { setAdding(false); changed() }}
        />
      ) : (
        <button type="button" className="booking-btn booking-btn-ghost" onClick={() => setAdding(true)}>
          ＋ Add another
        </button>
      )}
    </div>
  )
}

/* ── one product ────────────────────────────────────────────────────── */

function ProductCard({ product, open, onToggle, onChanged, wording }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function toggleLive() {
    setBusy(true)
    try {
      await updateProduct(product.id, { active: !product.active })
      onChanged()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    // The API keeps a product that has bookings and only deactivates it, so
    // this warning is about the case where it really will disappear.
    if (!confirm(`Remove "${product.name}"? Past bookings keep it on their receipts.`)) return
    setBusy(true)
    try {
      await deleteProduct(product.id)
      onChanged()
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  const cheapest = (product.rates || [])
    .filter((r) => r.active !== false)
    .reduce((low, r) => (!low || Number(r.amount) < Number(low.amount) ? r : low), null)

  return (
    <article className={`booking-card${product.active ? '' : ' booking-card-off'}`}>
      <header className="booking-card-head">
        <button type="button" className="booking-card-title" onClick={onToggle}>
          <span className="booking-card-name">{product.name}</span>
          <span className="booking-card-meta">
            {SCHEDULE_MODES[product.schedule_mode] || product.schedule_mode}
            {cheapest && ` · from ${money(cheapest.amount, product.currency)}`}
            {` · ${product.rates?.length || 0} price${product.rates?.length === 1 ? '' : 's'}`}
          </span>
        </button>
        <div className="booking-card-actions">
          <span className={`booking-badge${product.active ? ' good' : ''}`}>
            {product.active ? 'Live' : 'Off'}
          </span>
          <button type="button" className="booking-btn booking-btn-small" disabled={busy} onClick={toggleLive}>
            {product.active ? 'Take offline' : 'Put live'}
          </button>
          <button type="button" className="booking-card-expand" onClick={onToggle} aria-expanded={open}>
            {open ? '▲' : '▼'}
          </button>
        </div>
      </header>

      {error && <p className="auth-error">{error}</p>}

      {open && (
        <div className="booking-card-body">
          <ProductSettings product={product} onChanged={onChanged} />
          <RateList product={product} onChanged={onChanged} />
          {/* Only a product sold by the night has seasons to set. */}
          {product.schedule_mode === 'date_range' && (
            <BookingRates product={product} onChanged={onChanged} />
          )}
          <ScheduleList product={product} onChanged={onChanged} />
          <ExtraList product={product} onChanged={onChanged} />
          <div className="booking-card-danger">
            <button type="button" className="booking-btn booking-btn-danger" disabled={busy} onClick={remove}>
              Remove this {(wording?.one || 'item').toLowerCase()}
            </button>
          </div>
        </div>
      )}
    </article>
  )
}

/* ── the product's own settings ─────────────────────────────────────── */

function ProductSettings({ product, onChanged }) {
  const [draft, setDraft] = useState(product)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  useEffect(() => { setDraft(product) }, [product])

  const set = (key) => (event) => {
    const target = event.target
    const value = target.type === 'checkbox' ? target.checked : target.value
    setDraft((d) => ({ ...d, [key]: value }))
    setSaved(false)
  }

  async function save() {
    setBusy(true)
    setError('')
    try {
      await updateProduct(product.id, {
        name: draft.name,
        description: draft.description,
        schedule_mode: draft.schedule_mode,
        capacity_mode: draft.capacity_mode,
        capacity: Number(draft.capacity) || 1,
        duration_minutes: draft.duration_minutes === '' ? null : Number(draft.duration_minutes),
        min_party: Number(draft.min_party) || 1,
        max_party: draft.max_party === '' || draft.max_party == null ? null : Number(draft.max_party),
        lead_time_minutes: Number(draft.lead_time_minutes) || 0,
        deposit_mode: draft.deposit_mode,
        deposit_value: Number(draft.deposit_value) || 0,
        tax_percent: Number(draft.tax_percent) || 0,
        requires_waiver: !!draft.requires_waiver,
      })
      setSaved(true)
      onChanged()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  // The words change with the schedule mode; the fields do not.
  const capacityLabel = {
    seats: 'Seats per departure',
    units: 'How many you have',
    exclusive: 'Bookings per slot',
  }[draft.capacity_mode] || 'Capacity'

  return (
    <section className="booking-section">
      <h4>Details</h4>

      <label className="booking-field">
        <span>Name</span>
        <input value={draft.name || ''} onChange={set('name')} />
      </label>

      <label className="booking-field">
        <span>Description</span>
        <textarea rows={2} value={draft.description || ''} onChange={set('description')} />
      </label>

      <div className="booking-row">
        <label className="booking-field">
          <span>How it&apos;s scheduled</span>
          <select value={draft.schedule_mode} onChange={set('schedule_mode')}>
            {Object.entries(SCHEDULE_MODES).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </label>

        <label className="booking-field">
          <span>What fills up</span>
          <select value={draft.capacity_mode} onChange={set('capacity_mode')}>
            {Object.entries(CAPACITY_MODES).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="booking-row">
        <label className="booking-field">
          <span>{capacityLabel}</span>
          <input type="number" min="1" value={draft.capacity ?? ''} onChange={set('capacity')} />
        </label>

        <label className="booking-field">
          <span>How long it lasts (minutes)</span>
          <input type="number" min="0" value={draft.duration_minutes ?? ''} onChange={set('duration_minutes')} />
        </label>
      </div>

      <div className="booking-row">
        <label className="booking-field">
          <span>Smallest booking</span>
          <input type="number" min="1" value={draft.min_party ?? 1} onChange={set('min_party')} />
        </label>
        <label className="booking-field">
          <span>Largest booking (blank for no limit)</span>
          <input type="number" min="1" value={draft.max_party ?? ''} onChange={set('max_party')} />
        </label>
      </div>

      <label className="booking-field">
        <span>Close online booking this long before the start (minutes)</span>
        <input type="number" min="0" step="30" value={draft.lead_time_minutes ?? 0} onChange={set('lead_time_minutes')} />
        <small>
          {Number(draft.lead_time_minutes) > 0
            ? `Customers can book up to ${hoursFrom(draft.lead_time_minutes)} before you leave.`
            : 'Customers can book right up to the start time.'}
        </small>
      </label>

      <div className="booking-row">
        <label className="booking-field">
          <span>Taken at booking</span>
          <select value={draft.deposit_mode} onChange={set('deposit_mode')}>
            <option value="full">The full amount</option>
            <option value="percent">A percentage deposit</option>
            <option value="amount">A fixed deposit</option>
            <option value="none">Nothing — they pay you on the day</option>
          </select>
        </label>

        {(draft.deposit_mode === 'percent' || draft.deposit_mode === 'amount') && (
          <label className="booking-field">
            <span>{draft.deposit_mode === 'percent' ? 'Deposit %' : 'Deposit amount'}</span>
            <input type="number" min="0" step="1" value={draft.deposit_value ?? 0} onChange={set('deposit_value')} />
          </label>
        )}
      </div>

      <div className="booking-row">
        <label className="booking-field">
          <span>Tax added at checkout (%)</span>
          <input type="number" min="0" step="0.1" value={draft.tax_percent ?? 0} onChange={set('tax_percent')} />
        </label>
        <label className="booking-check">
          <input type="checkbox" checked={!!draft.requires_waiver} onChange={set('requires_waiver')} />
          <span>Customers must sign a waiver</span>
        </label>
      </div>

      <p className="booking-note">{depositLabel(draft)}</p>

      {error && <p className="auth-error">{error}</p>}
      <button type="button" className="booking-btn" disabled={busy} onClick={save}>
        {busy ? 'Saving…' : saved ? 'Saved' : 'Save details'}
      </button>
    </section>
  )
}

function hoursFrom(minutes) {
  const value = Number(minutes) || 0
  if (value < 60) return `${value} minutes`
  const hours = value / 60
  if (hours < 48) return `${Number.isInteger(hours) ? hours : hours.toFixed(1)} hours`
  return `${Math.round(hours / 24)} days`
}

/* ── prices ─────────────────────────────────────────────────────────── */

const PRICING_MODES = {
  per_person: 'per person',
  per_group: 'for the whole booking',
  per_unit: 'per unit',
  per_hour: 'per hour',
  per_day: 'per day',
  per_night: 'per night',
}

function RateList({ product, onChanged }) {
  const [error, setError] = useState('')
  const list = product.rates || []

  async function add() {
    setError('')
    try {
      await ratesApi.create({
        product_id: product.id,
        label: 'New price',
        pricing_mode: 'per_person',
        amount: 0,
      })
      onChanged()
    } catch (err) { setError(err.message) }
  }

  return (
    <section className="booking-section">
      <h4>Prices</h4>
      <p className="booking-note">
        One line per price you charge. A trip sold by the seat has a line per age band; a whole-boat
        charter is a single line priced for the group.
      </p>
      {error && <p className="auth-error">{error}</p>}

      {list.map((rate) => (
        <RateRow key={rate.id} rate={rate} currency={product.currency} onChanged={onChanged} />
      ))}

      <button type="button" className="booking-btn booking-btn-ghost booking-btn-small" onClick={add}>
        ＋ Add a price
      </button>
    </section>
  )
}

function RateRow({ rate, currency, onChanged }) {
  const [draft, setDraft] = useState(rate)
  const [busy, setBusy] = useState(false)
  const dirty = draft.label !== rate.label ||
    Number(draft.amount) !== Number(rate.amount) ||
    draft.pricing_mode !== rate.pricing_mode ||
    !!draft.occupies_capacity !== !!rate.occupies_capacity

  useEffect(() => { setDraft(rate) }, [rate])

  async function save() {
    setBusy(true)
    try {
      await ratesApi.update(rate.id, {
        label: draft.label,
        amount: Number(draft.amount) || 0,
        pricing_mode: draft.pricing_mode,
        occupies_capacity: !!draft.occupies_capacity,
      })
      onChanged()
    } finally { setBusy(false) }
  }

  async function remove() {
    if (!confirm(`Remove the "${rate.label}" price?`)) return
    setBusy(true)
    try {
      await ratesApi.remove(rate.id)
      onChanged()
    } finally { setBusy(false) }
  }

  return (
    <div className="booking-inline">
      <input
        className="booking-inline-label"
        value={draft.label || ''}
        onChange={(e) => setDraft({ ...draft, label: e.target.value })}
        placeholder="Adult"
      />
      <div className="booking-inline-price">
        <span aria-hidden="true">$</span>
        <input
          type="number" min="0" step="0.01"
          value={draft.amount ?? 0}
          onChange={(e) => setDraft({ ...draft, amount: e.target.value })}
        />
      </div>
      <select
        className="booking-inline-mode"
        value={draft.pricing_mode}
        onChange={(e) => setDraft({ ...draft, pricing_mode: e.target.value })}
      >
        {Object.entries(PRICING_MODES).map(([value, label]) => (
          <option key={value} value={value}>{label}</option>
        ))}
      </select>
      <label className="booking-inline-check" title="Uncheck for a lap infant or anyone who doesn't take a place">
        <input
          type="checkbox"
          checked={draft.occupies_capacity !== false}
          onChange={(e) => setDraft({ ...draft, occupies_capacity: e.target.checked })}
        />
        <span>takes a place</span>
      </label>
      {dirty && (
        <button type="button" className="booking-btn booking-btn-small" disabled={busy} onClick={save}>
          Save
        </button>
      )}
      <button type="button" className="booking-icon-btn" disabled={busy} onClick={remove} aria-label="Remove price">
        ✕
      </button>
      <span className="booking-inline-preview">{money(draft.amount, currency)}</span>
    </div>
  )
}

/* ── hours ──────────────────────────────────────────────────────────── */

const DAY_NAMES = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']

function ScheduleList({ product, onChanged }) {
  const [error, setError] = useState('')
  const list = (product.schedules || []).filter((s) => s.kind !== 'blackout')
  const closures = (product.schedules || []).filter((s) => s.kind === 'blackout')

  async function addHours() {
    setError('')
    try {
      await schedulesApi.create({
        product_id: product.id,
        kind: 'weekly',
        days_of_week: [0, 1, 2, 3, 4, 5, 6],
        ...(product.schedule_mode === 'duration_slots'
          ? { window_start: '09:00', window_end: '17:00', slot_interval_minutes: product.duration_minutes || 60 }
          : { times: ['09:00'] }),
      })
      onChanged()
    } catch (err) { setError(err.message) }
  }

  async function addClosure() {
    const date = prompt('Close which date? (YYYY-MM-DD)')
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return
    try {
      await schedulesApi.create({ product_id: product.id, kind: 'blackout', specific_date: date })
      onChanged()
    } catch (err) { setError(err.message) }
  }

  if (product.schedule_mode === 'request') {
    return (
      <section className="booking-section">
        <h4>When it runs</h4>
        <p className="booking-note">
          This one takes enquiries rather than bookings, so it has no calendar. Customers send you
          what they want and you quote it.
        </p>
      </section>
    )
  }

  return (
    <section className="booking-section">
      <h4>When it runs</h4>
      {error && <p className="auth-error">{error}</p>}

      {!list.length && (
        <p className="booking-note">
          No hours set — this trip is bookable on any date inside your booking window.
        </p>
      )}

      {list.map((schedule) => (
        <ScheduleRow
          key={schedule.id}
          schedule={schedule}
          product={product}
          onChanged={onChanged}
        />
      ))}

      {!!closures.length && (
        <div className="booking-closures">
          <span>Closed:</span>
          {closures.map((c) => (
            <button
              key={c.id}
              type="button"
              className="booking-chip"
              onClick={async () => { await schedulesApi.remove(c.id); onChanged() }}
              title="Click to reopen this date"
            >
              {c.specific_date} ✕
            </button>
          ))}
        </div>
      )}

      <div className="booking-btn-row">
        <button type="button" className="booking-btn booking-btn-ghost booking-btn-small" onClick={addHours}>
          ＋ Add hours
        </button>
        <button type="button" className="booking-btn booking-btn-ghost booking-btn-small" onClick={addClosure}>
          ＋ Close a date
        </button>
      </div>
    </section>
  )
}

function ScheduleRow({ schedule, product, onChanged }) {
  const [draft, setDraft] = useState(schedule)
  const [busy, setBusy] = useState(false)
  useEffect(() => { setDraft(schedule) }, [schedule])

  const days = draft.days_of_week || []
  const slicing = product.schedule_mode === 'duration_slots'

  function toggleDay(index) {
    const next = days.includes(index) ? days.filter((d) => d !== index) : [...days, index].sort()
    setDraft({ ...draft, days_of_week: next })
  }

  async function save() {
    setBusy(true)
    try {
      await schedulesApi.update(schedule.id, {
        days_of_week: draft.days_of_week,
        times: draft.times,
        window_start: draft.window_start,
        window_end: draft.window_end,
        slot_interval_minutes: draft.slot_interval_minutes === '' ? null : Number(draft.slot_interval_minutes),
      })
      onChanged()
    } finally { setBusy(false) }
  }

  async function remove() {
    setBusy(true)
    try { await schedulesApi.remove(schedule.id); onChanged() } finally { setBusy(false) }
  }

  return (
    <div className="booking-schedule">
      <div className="booking-days">
        {DAY_NAMES.map((name, index) => (
          <button
            key={name}
            type="button"
            className={`booking-day${days.includes(index) ? ' on' : ''}`}
            onClick={() => toggleDay(index)}
          >
            {name}
          </button>
        ))}
      </div>

      {slicing ? (
        <div className="booking-row">
          <label className="booking-field">
            <span>Opens</span>
            <input type="time" value={(draft.window_start || '').slice(0, 5)}
              onChange={(e) => setDraft({ ...draft, window_start: e.target.value })} />
          </label>
          <label className="booking-field">
            <span>Last one back by</span>
            <input type="time" value={(draft.window_end || '').slice(0, 5)}
              onChange={(e) => setDraft({ ...draft, window_end: e.target.value })} />
          </label>
          <label className="booking-field">
            <span>A slot every (min)</span>
            <input type="number" min="15" step="15" value={draft.slot_interval_minutes ?? ''}
              onChange={(e) => setDraft({ ...draft, slot_interval_minutes: e.target.value })} />
          </label>
        </div>
      ) : (
        <label className="booking-field">
          <span>Departure times</span>
          <input
            value={(draft.times || []).join(', ')}
            placeholder="06:00, 13:00"
            onChange={(e) => setDraft({
              ...draft,
              times: e.target.value.split(',').map((t) => t.trim()).filter(Boolean),
            })}
          />
          <small>24-hour times, separated by commas.</small>
        </label>
      )}

      <div className="booking-btn-row">
        <button type="button" className="booking-btn booking-btn-small" disabled={busy} onClick={save}>Save hours</button>
        <button type="button" className="booking-icon-btn" disabled={busy} onClick={remove} aria-label="Remove hours">✕</button>
      </div>
    </div>
  )
}

/* ── extras ─────────────────────────────────────────────────────────── */

function ExtraList({ product, onChanged }) {
  const list = product.extras || []
  const [error, setError] = useState('')

  async function add() {
    setError('')
    try {
      await extrasApi.create({ product_id: product.id, name: 'New extra', price: 0, pricing_mode: 'per_booking' })
      onChanged()
    } catch (err) { setError(err.message) }
  }

  return (
    <section className="booking-section">
      <h4>Extras</h4>
      <p className="booking-note">Offered at checkout. Leave it empty if you don&apos;t upsell anything.</p>
      {error && <p className="auth-error">{error}</p>}

      {list.map((extra) => (
        <ExtraRow key={extra.id} extra={extra} currency={product.currency} onChanged={onChanged} />
      ))}

      <button type="button" className="booking-btn booking-btn-ghost booking-btn-small" onClick={add}>
        ＋ Add an extra
      </button>
    </section>
  )
}

function ExtraRow({ extra, currency, onChanged }) {
  const [draft, setDraft] = useState(extra)
  const [busy, setBusy] = useState(false)
  useEffect(() => { setDraft(extra) }, [extra])

  const dirty = draft.name !== extra.name ||
    Number(draft.price) !== Number(extra.price) ||
    draft.pricing_mode !== extra.pricing_mode ||
    !!draft.required !== !!extra.required

  async function save() {
    setBusy(true)
    try {
      await extrasApi.update(extra.id, {
        name: draft.name,
        price: Number(draft.price) || 0,
        pricing_mode: draft.pricing_mode,
        required: !!draft.required,
      })
      onChanged()
    } finally { setBusy(false) }
  }

  return (
    <div className="booking-inline">
      <input
        className="booking-inline-label"
        value={draft.name || ''}
        onChange={(e) => setDraft({ ...draft, name: e.target.value })}
      />
      <div className="booking-inline-price">
        <span aria-hidden="true">$</span>
        <input type="number" min="0" step="0.01" value={draft.price ?? 0}
          onChange={(e) => setDraft({ ...draft, price: e.target.value })} />
      </div>
      <select
        className="booking-inline-mode"
        value={draft.pricing_mode}
        onChange={(e) => setDraft({ ...draft, pricing_mode: e.target.value })}
      >
        <option value="per_booking">per booking</option>
        <option value="per_person">per person</option>
        <option value="per_unit">per unit</option>
        <option value="per_day">per day</option>
      </select>
      <label className="booking-inline-check" title="Always added, not optional">
        <input type="checkbox" checked={!!draft.required}
          onChange={(e) => setDraft({ ...draft, required: e.target.checked })} />
        <span>always</span>
      </label>
      {dirty && (
        <button type="button" className="booking-btn booking-btn-small" disabled={busy} onClick={save}>Save</button>
      )}
      <button
        type="button" className="booking-icon-btn" disabled={busy}
        onClick={async () => { await extrasApi.remove(extra.id); onChanged() }}
        aria-label="Remove extra"
      >✕</button>
      <span className="booking-inline-preview">{money(draft.price, currency)}</span>
    </div>
  )
}

/* ── adding another ─────────────────────────────────────────────────── */

function AddProduct({ templates, wording, onCancel, onDone }) {
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')

  async function choose(templateId) {
    setBusy(templateId)
    setError('')
    try {
      await createProduct(templateId ? { template_id: templateId } : { name: 'New trip' })
      onDone()
    } catch (err) {
      setError(err.message)
      setBusy('')
    }
  }

  return (
    <div className="booking-add">
      <h4>What are you adding?</h4>
      {wording?.many && (
        <p className="booking-note">
          It will sit alongside your other {wording.many.toLowerCase()}.
        </p>
      )}
      {error && <p className="auth-error">{error}</p>}
      <div className="booking-template-grid booking-template-grid-small">
        {templates.map((template) => (
          <button
            key={template.id}
            type="button"
            className="booking-template"
            disabled={!!busy}
            onClick={() => choose(template.id)}
          >
            <span className="booking-template-icon" aria-hidden="true">{template.icon || '📦'}</span>
            <span className="booking-template-name">{template.name}</span>
          </button>
        ))}
      </div>
      <div className="booking-btn-row">
        <button type="button" className="booking-btn booking-btn-ghost booking-btn-small" disabled={!!busy} onClick={() => choose(null)}>
          Start from scratch instead
        </button>
        <button type="button" className="booking-btn booking-btn-ghost booking-btn-small" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  )
}
