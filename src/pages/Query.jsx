import { useCallback, useEffect, useMemo, useState } from 'react'
import { fetchQuerySchema, runOwnerQuery, runOwnerMutation } from '../lib/ownerQueryApi'

/**
 * Owner Query — shared v1 contract. Resources, fields and writable fields all come
 * from GET /api/business/query/schema (nothing hardcoded). No SQL. Edits preview a
 * diff; commit needs a reason and is refused server-side (writes_disabled) until the
 * atomic mutation+audit follow-up ships.
 */
const errText = (err) => err?.body?.error?.message || err?.message || 'Request failed'

export default function Query() {
  const [schema, setSchema] = useState(null)
  const [resource, setResource] = useState('')
  const [result, setResult] = useState(null)
  const [pageNo, setPageNo] = useState(1)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [editing, setEditing] = useState(null)
  const [values, setValues] = useState({})
  const [reason, setReason] = useState('')
  const [preview, setPreview] = useState(null)

  useEffect(() => {
    let off = false
    fetchQuerySchema().then((s) => {
      if (off) return
      setSchema(s)
      const first = Object.keys(s.resources || {})[0]
      if (first) setResource(first)
    }).catch((e) => { if (!off) setError(errText(e)) })
    return () => { off = true }
  }, [])

  // The mutation whose name prefix matches this resource (from schema, e.g. booking.update).
  const mutation = useMemo(() => {
    if (!schema || !resource) return null
    const stem = resource.replace(/(es|s)$/, '')
    const hit = Object.entries(schema.mutations || {}).find(([k, m]) =>
      (k.startsWith(`${resource}.`) || k.startsWith(`${stem}.`)) && m.op !== 'insert')
    return hit ? { action: hit[0], ...hit[1] } : null
  }, [schema, resource])

  const fields = schema?.resources?.[resource]?.fields || []

  const run = useCallback(async (res = resource, number = 1) => {
    if (!res) return
    setBusy(true); setError(''); setEditing(null); setPreview(null)
    try {
      const data = await runOwnerQuery({ resource: res, page: { number, size: 50 } })
      setResult(data); setPageNo(number)
    } catch (e) { setError(errText(e)); setResult(null) } finally { setBusy(false) }
  }, [resource])

  const startEdit = (row) => {
    setEditing(row); setPreview(null); setReason('')
    setValues(Object.fromEntries((mutation?.fields || []).map((f) => [f, row[f] ?? ''])))
  }

  async function submit(mode) {
    setError('')
    if (!reason.trim()) { setError('Add a short reason for this change (audit).'); return }
    try {
      const out = await runOwnerMutation({
        action: mutation.action, id: editing.id, values, reason: reason.trim(), mode,
        expected_version: editing.updated_at,
        idempotency_key: mode === 'commit' ? `owner-${mutation.action}-${editing.id}-${editing.updated_at}` : undefined,
      })
      if (mode === 'preview') setPreview(out)
      else { setEditing(null); await run(resource, pageNo) }
    } catch (e) { setError(errText(e)) }
  }

  const cols = fields.filter((f) => f !== 'entity_slug').slice(0, 8)
  return (
    <div className="calendar-page">
      <header className="calendar-header">
        <h2>Query</h2>
        <p className="claim-sub">Your business data only — no SQL, no other businesses.</p>
      </header>
      {error ? <p className="auth-error">{error}</p> : null}
      <section className="calendar-section">
        <div className="calendar-feed-actions" style={{ flexWrap: 'wrap' }}>
          {Object.keys(schema?.resources || {}).map((r) => (
            <button key={r} type="button" className={`secondary${resource === r ? ' active' : ''}`}
              onClick={() => { setResource(r); run(r, 1) }}>{r}</button>
          ))}
        </div>
        <button type="button" className="primary" disabled={busy || !resource} onClick={() => run(resource, 1)}>
          {busy ? 'Loading…' : 'Run'}
        </button>
      </section>
      {result && (
        <section className="calendar-section">
          <h3>{result.resource}<span className="claim-sub"> · {result.page?.total ?? result.rows.length} rows</span></h3>
          {!result.rows?.length ? <p className="claim-sub">No rows for this business.</p> : (
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr>{cols.map((c) => <th key={c} style={{ textAlign: 'left', padding: '6px 8px' }}>{c}</th>)}{mutation ? <th /> : null}</tr></thead>
                <tbody>{result.rows.map((row, i) => (
                  <tr key={row.id ?? i}>
                    {cols.map((c) => <td key={c} style={{ padding: '6px 8px', fontSize: '0.85rem' }}>{fmt(row[c])}</td>)}
                    {mutation && row.id ? <td><button type="button" className="secondary" onClick={() => startEdit(row)}>Edit</button></td> : null}
                  </tr>))}
                </tbody>
              </table>
            </div>
          )}
          <div className="calendar-feed-actions">
            <button type="button" className="secondary" disabled={pageNo <= 1} onClick={() => run(resource, pageNo - 1)}>Prev</button>
            <button type="button" className="secondary" disabled={!result.page?.has_more} onClick={() => run(resource, pageNo + 1)}>Next</button>
          </div>
        </section>
      )}
      {editing && mutation && (
        <section className="calendar-section">
          <h3>Edit ({mutation.action})</h3>
          {mutation.fields.map((f) => (
            <label key={f} className="calendar-slug-picker">{f}
              <input type="text" value={values[f] ?? ''} onChange={(e) => setValues({ ...values, [f]: e.target.value })} />
            </label>
          ))}
          <label className="calendar-slug-picker">Reason for change (required)
            <input type="text" value={reason} onChange={(e) => setReason(e.target.value)} required />
          </label>
          <div className="calendar-feed-actions">
            <button type="button" className="secondary" onClick={() => submit('preview')}>Preview</button>
            <button type="button" className="primary" disabled={!preview} onClick={() => submit('commit')}>Save</button>
            <button type="button" className="secondary" onClick={() => setEditing(null)}>Cancel</button>
          </div>
          {preview ? <pre style={{ fontSize: '0.8rem' }}>{JSON.stringify(preview.changes, null, 2)}</pre> : null}
        </section>
      )}
    </div>
  )
}

function fmt(v) { return v == null ? '—' : typeof v === 'object' ? JSON.stringify(v) : String(v) }
