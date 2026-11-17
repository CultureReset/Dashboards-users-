import { useState } from 'react'
import { getColumns, isEditableColumn } from '../lib/schemaDiscovery'
import { labelFor } from '../lib/discoverSections'
import { kindOf, toField, isMultiline, buildPayload } from '../lib/rowForm'

// A form that builds itself from a table's columns. Nothing here knows about
// menus or hours or charters — give it any table and it renders the right
// inputs, so tables added to the database later are editable with no new code.
// Lists and JSON columns get their own boxes (lib/rowForm.js) so they round-trip.

function inputFor(col, value, onChange, invalid) {
  const common = {
    id: `field-${col.name}`,
    value: value ?? '',
    onChange: (e) => onChange(col.name, e.target.value),
    'aria-invalid': invalid ? 'true' : undefined,
  }

  if (col.enum) {
    return (
      <select {...common}>
        <option value="">—</option>
        {col.enum.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
    )
  }

  const kind = kindOf(col)

  if (kind === 'boolean') {
    return (
      <select {...common}>
        <option value="">—</option>
        <option value="true">Yes</option>
        <option value="false">No</option>
      </select>
    )
  }

  if (kind === 'integer') return <input type="number" step="1" inputMode="numeric" {...common} />
  if (kind === 'number') return <input type="number" step="any" inputMode="decimal" {...common} />

  if (kind === 'array') {
    return <textarea rows={4} className="editor-mono" placeholder="One per line" {...common} />
  }
  if (kind === 'json') return <textarea rows={5} className="editor-mono" spellCheck={false} {...common} />

  if (col.format === 'date') return <input type="date" {...common} />
  if (col.format === 'time' || col.format.startsWith('time')) {
    return <input type="time" {...common} />
  }
  if (/timestamp/.test(col.format)) {
    return <input type="datetime-local" {...common} />
  }

  // Free text: longer fields get a textarea.
  if (/description|body|answer|notes?|content|summary|terms/i.test(col.name)) {
    return <textarea rows={3} {...common} />
  }

  return <input type="text" {...common} />
}

export default function RowEditor({ table, row, onSave, onCancel, onDelete }) {
  const columns = getColumns(table).filter(isEditableColumn)
  const [values, setValues] = useState(() => {
    const seed = {}
    for (const col of columns) seed[col.name] = toField(col, row?.[col.name])
    return seed
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState({})

  function change(name, value) {
    setValues((v) => ({ ...v, [name]: value }))
    setFieldErrors((e) => (e[name] ? { ...e, [name]: undefined } : e))
  }

  async function submit(e) {
    e.preventDefault()
    setError('')
    const result = buildPayload(columns, values, row)
    if (result.errors) {
      setFieldErrors(result.errors)
      setError('Fix the highlighted fields and try again.')
      return
    }
    setFieldErrors({})
    if (row && !Object.keys(result.values).length) {
      setError('Nothing has changed.')
      return
    }
    setBusy(true)
    try {
      await onSave(result.values)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    if (!confirm('Delete this permanently? Guests will stop seeing it.')) return
    setBusy(true)
    setError('')
    try {
      await onDelete()
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  if (!columns.length) {
    return (
      <div className="editor">
        <p className="auth-error">This table has no editable fields.</p>
        <button onClick={onCancel}>Close</button>
      </div>
    )
  }

  return (
    <form className="editor" onSubmit={submit} noValidate>
      {columns.map((col) => (
        <label key={col.name} className={`editor-field${isMultiline(col) ? ' editor-field-wide' : ''}`}>
          <span>{labelFor(col.name)}</span>
          {inputFor(col, values[col.name], change, !!fieldErrors[col.name])}
          {fieldErrors[col.name] && <small className="editor-error" role="alert">{fieldErrors[col.name]}</small>}
        </label>
      ))}

      {error && <p className="auth-error" role="alert">{error}</p>}

      <div className="editor-actions">
        <button type="submit" className="primary" disabled={busy}>
          {busy ? 'Saving…' : 'Save'}
        </button>
        <button type="button" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
        {row && onDelete && (
          <button type="button" className="danger" onClick={remove} disabled={busy}>
            Delete
          </button>
        )}
      </div>
    </form>
  )
}
