import { useCallback, useEffect, useMemo, useState } from 'react'
import { fetchQueryCatalog, runOwnerQuery, runOwnerMutation } from '../lib/ownerQueryApi'
import RowEditor from '../components/RowEditor'
import { getColumns } from '../lib/schemaDiscovery'

/**
 * Owner Query — ask by resource (bookings / availability / payments / units / …).
 * No freeform SQL. Writes require an audit reason. Path is provisional
 * (/api/business/query) until Admin commits the shared /api/query route.
 */
export default function Query() {
  const [catalog, setCatalog] = useState([])
  const [resource, setResource] = useState('')
  const [question, setQuestion] = useState('')
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [editing, setEditing] = useState(null)
  const [reason, setReason] = useState('')

  useEffect(() => {
    let cancelled = false
    fetchQueryCatalog()
      .then((data) => {
        if (cancelled) return
        const list = data.catalog || []
        setCatalog(list)
        if (!resource && list[0]) setResource(list[0].resource)
      })
      .catch((err) => { if (!cancelled) setError(err.message) })
    return () => { cancelled = true }
  }, [])

  const chips = useMemo(() => {
    const out = []
    for (const c of catalog) {
      out.push(c.resource)
      for (const intent of c.intents || []) {
        if (!out.includes(intent)) out.push(intent)
      }
    }
    return out
  }, [catalog])

  const run = useCallback(async (resKey) => {
    const key = (resKey || resource || question).trim()
    if (!key) return
    setBusy(true)
    setError('')
    setEditing(null)
    try {
      // Prefer resource token; plain-language falls back to same field (server aliases).
      const body = { resource: key, page: 1, page_size: 50 }
      const data = await runOwnerQuery(body)
      setResult(data)
      setResource(data.resource || key)
    } catch (err) {
      setError(err.message)
      setResult(null)
    } finally {
      setBusy(false)
    }
  }, [resource, question])

  async function saveEdit(values) {
    if (!editing || !result?.write_allowed) return
    if (!reason.trim()) throw new Error('Add a short reason for this change (audit).')
    await runOwnerMutation({
      action: 'update',
      table: result.table,
      id: editing.id,
      values,
      reason: reason.trim(),
    })
    setEditing(null)
    setReason('')
    await run(result.resource || result.table)
  }

  async function deleteRow() {
    if (!editing || !result?.write_allowed) return
    if (!reason.trim()) throw new Error('Add a short reason for this delete (audit).')
    await runOwnerMutation({
      action: 'delete',
      table: result.table,
      id: editing.id,
      reason: reason.trim(),
    })
    setEditing(null)
    setReason('')
    await run(result.resource || result.table)
  }

  const columns = result?.columns?.length
    ? result.columns
    : getColumns(result?.table || '')

  return (
    <div className="calendar-page">
      <header className="calendar-header">
        <h2>Query</h2>
        <p className="claim-sub">
          Ask about your bookings, availability, payments, units, and more.
          Answers come from your business data only — no SQL, no other businesses.
        </p>
      </header>

      {error ? <p className="auth-error">{error}</p> : null}

      <section className="calendar-section">
        <form
          className="calendar-add-form"
          onSubmit={(e) => { e.preventDefault(); run(question || resource) }}
        >
          <label>
            What do you want to see?
            <input
              type="text"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="units, bookings, availability…"
            />
          </label>
          <div className="calendar-feed-actions" style={{ flexWrap: 'wrap' }}>
            {chips.slice(0, 16).map((chip) => (
              <button
                key={chip}
                type="button"
                className={`secondary${resource === chip ? ' active' : ''}`}
                onClick={() => { setResource(chip); setQuestion(chip); run(chip) }}
              >
                {chip}
              </button>
            ))}
          </div>
          <button type="submit" className="primary" disabled={busy}>
            {busy ? 'Loading…' : 'Run'}
          </button>
        </form>
      </section>

      {result && (
        <section className="calendar-section">
          <h3>
            {result.resource || result.table}
            <span className="claim-sub"> · {result.total ?? result.rows?.length ?? 0} rows</span>
          </h3>
          {!result.rows?.length ? (
            <p className="claim-sub">No rows for this business.</p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    {(columns || []).filter((c) => c.name !== 'entity_slug').slice(0, 8).map((c) => (
                      <th key={c.name} style={{ textAlign: 'left', padding: '6px 8px', borderBottom: '1px solid var(--border)' }}>
                        {c.name}
                      </th>
                    ))}
                    {result.write_allowed ? <th /> : null}
                  </tr>
                </thead>
                <tbody>
                  {result.rows.map((row) => (
                    <tr key={row.id ?? JSON.stringify(row)}>
                      {(columns || []).filter((c) => c.name !== 'entity_slug').slice(0, 8).map((c) => (
                        <td key={c.name} style={{ padding: '6px 8px', borderBottom: '1px solid var(--border)', fontSize: '0.85rem' }}>
                          {formatCell(row[c.name])}
                        </td>
                      ))}
                      {result.write_allowed ? (
                        <td>
                          <button type="button" className="secondary" onClick={() => setEditing(row)}>
                            Edit
                          </button>
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {editing && (
        <section className="calendar-section">
          <h3>Edit row</h3>
          <label className="calendar-slug-picker">
            Reason for change (required)
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. corrected nightly price"
              required
            />
          </label>
          <RowEditor
            table={result.table}
            row={editing}
            onSave={saveEdit}
            onCancel={() => { setEditing(null); setReason('') }}
            onDelete={result.write_allowed ? deleteRow : undefined}
          />
        </section>
      )}
    </div>
  )
}

function formatCell(value) {
  if (value == null) return '—'
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}
