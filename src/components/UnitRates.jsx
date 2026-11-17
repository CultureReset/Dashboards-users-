import { useCallback, useEffect, useState } from 'react'
import { fetchRows, updateRow } from '../lib/writeEntityData'
import { labelFor } from '../lib/discoverSections'
import { money } from '../lib/format'

// Rates and stay rules for each bookable unit — the numbers a guest is quoted on
// the rental page (nightly price, fees, minimum stay). The rows are the
// business's own `bookable_resources`, read and written through the same
// owner-scoped /api/business/:table routes as every other section; the slug is
// never sent. Only the fields a unit actually has are shown.

const FIELDS = [
  { name: 'nightly_price', kind: 'money' },
  { name: 'cleaning_fee', kind: 'money' },
  { name: 'service_fee', kind: 'money' },
  { name: 'min_nights', kind: 'int' },
]
const TABLE = 'bookable_resources'

function toForm(row) {
  const f = {}
  for (const { name } of FIELDS) if (name in row) f[name] = row[name] == null ? '' : String(row[name])
  f.is_active = row.is_active !== false
  return f
}

function Unit({ row, onSaved }) {
  const [form, setForm] = useState(() => toForm(row))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState('')
  const fields = FIELDS.filter((f) => f.name in row)

  async function save(e) {
    e.preventDefault()
    setError('')
    setSaved('')
    const changes = {}
    for (const f of fields) {
      const raw = form[f.name].trim()
      const before = row[f.name] == null ? '' : String(row[f.name])
      if (raw === before) continue
      if (raw === '') { changes[f.name] = null; continue }
      const n = Number(raw)
      if (!Number.isFinite(n) || n < 0) return setError(`${labelFor(f.name)} must be a number, zero or more.`)
      if (f.kind === 'int' && (!Number.isInteger(n) || n < 1)) return setError('Minimum nights must be a whole number, 1 or more.')
      changes[f.name] = n
    }
    if ('is_active' in row && form.is_active !== (row.is_active !== false)) {
      if (!form.is_active && !confirm('Hide this unit from guests? Its page and its calendar stop showing until you turn it back on.')) return
      changes.is_active = form.is_active
    }
    if (!Object.keys(changes).length) return setError('Nothing has changed.')
    setBusy(true)
    try {
      const next = await updateRow(TABLE, row.id, changes)
      setSaved('Saved. Guests see the new rates within a few minutes.')
      onSaved(next)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="calendar-unit-card unit-rates" onSubmit={save} noValidate>
      <div className="calendar-unit-head">
        <strong>{row.name || row.slug || `Unit ${row.id}`}</strong>
        {row.nightly_price != null ? <span className="chip">{money(row.nightly_price)} / night</span> : null}
        {row.is_active === false ? <span className="chip">Hidden from guests</span> : null}
      </div>
      <div className="unit-rates-grid">
        {fields.map((f) => (
          <label key={f.name} className="editor-field">
            <span>{labelFor(f.name)}{f.kind === 'money' ? ' ($)' : ''}</span>
            <input
              type="number"
              min={f.kind === 'int' ? 1 : 0}
              step={f.kind === 'int' ? 1 : 'any'}
              inputMode={f.kind === 'int' ? 'numeric' : 'decimal'}
              value={form[f.name]}
              onChange={(e) => setForm((v) => ({ ...v, [f.name]: e.target.value }))}
            />
          </label>
        ))}
      </div>
      {'is_active' in row ? (
        <label className="unit-rates-toggle">
          <input type="checkbox" checked={form.is_active} onChange={(e) => setForm((v) => ({ ...v, is_active: e.target.checked }))} />
          Show this unit to guests
        </label>
      ) : null}
      {error ? <p className="auth-error" role="alert">{error}</p> : null}
      {saved ? <p className="avail-message" role="status">{saved}</p> : null}
      <button type="submit" className="primary" disabled={busy}>{busy ? 'Saving…' : 'Save rates'}</button>
    </form>
  )
}

export default function UnitRates() {
  const [rows, setRows] = useState(null)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setError('')
    try {
      const all = await fetchRows(TABLE)
      setRows(all.filter((r) => r.id != null))
    } catch (err) {
      setRows(null)
      setError(err.message || 'Could not load your units.')
    }
  }, [])
  useEffect(() => { load() }, [load])

  if (error) {
    return (
      <section className="calendar-section">
        <h3>Rates and stay rules</h3>
        <p className="auth-error" role="alert">{error} <button type="button" className="secondary" onClick={load}>Try again</button></p>
      </section>
    )
  }
  if (rows === null) {
    return <section className="calendar-section"><h3>Rates and stay rules</h3><p className="claim-sub" role="status">Loading your units…</p></section>
  }
  if (!rows.length) return null // not a rental: nothing to price per night

  return (
    <section className="calendar-section">
      <h3>Rates and stay rules</h3>
      <p className="claim-sub">What guests are quoted on each unit's page. Fees are added once per stay.</p>
      {rows.map((row) => (
        <Unit key={row.id} row={row} onSaved={(next) => setRows((all) => all.map((r) => (r.id === next.id ? { ...r, ...next } : r)))} />
      ))}
    </section>
  )
}
