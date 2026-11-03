import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import FormSheet from './FormSheet'
import { InlineProblem } from './states'
import { useMediaQuery } from './useMediaQuery'
import { useConfirm } from '../components/ConfirmSheet'
import { useToast } from '../components/Toast'
import {
  classifyError, createSdkRow, deleteSdkRow, listSdkRows, updateSdkRow,
} from './api'
import {
  applyView, filterFields, formDefaults, formFromRow, formatCell, formatStamp, friendlyMessage,
  inputKind, listColumns, pageInfo, rowTitle, shortLabel, sortOptions, tableColumns,
} from './validate'

const PAGE = 50
const TEXTY = new Set(['text', 'textarea', 'email', 'tel', 'url', 'image', 'select'])

/**
 * One declared resource: a list (cards on a phone, a table on a desktop) with
 * Add, Edit and Delete, everything drawn from the resource's field definitions.
 *
 * `registerAdd(fn)` lets the Actions section open this resource's Add form for a
 * `create` action. `onGone()` is called when the API says the app is no longer
 * installed (uninstalled in another tab mid-session).
 */
export default function ResourceSection({ app, resource, registerAdd, onGone, onCount }) {
  const [state, setState] = useState({ status: 'loading', rows: [], total: 0, limit: PAGE, offset: 0, problem: null })
  const [view, setView] = useState({ sortKey: '_created', dir: 'desc', filters: {}, query: '' })
  const [sheet, setSheet] = useState(null) // { mode: 'add' } | { mode: 'edit', row }
  const [busyRow, setBusyRow] = useState(null)
  const [live, setLive] = useState('')
  const wide = useMediaQuery('(min-width: 720px)')
  const toast = useToast()
  const confirm = useConfirm()
  const uid = useId().replace(/:/g, '')
  const seq = useRef(0)
  const offsetRef = useRef(0)
  const headingRef = useRef(null)

  const columns = useMemo(() => listColumns(resource), [resource])
  const tableCols = useMemo(() => tableColumns(resource), [resource])
  const filters = useMemo(() => filterFields(resource), [resource])
  const hasText = useMemo(() => resource.fields.some((f) => TEXTY.has(inputKind(f))), [resource])

  const load = useCallback(async (offset = offsetRef.current) => {
    const mine = ++seq.current
    setState((s) => ({ ...s, status: s.rows.length || s.status === 'ready' ? 'refreshing' : 'loading', problem: null }))
    try {
      const data = await listSdkRows(app.id, resource.id, { limit: PAGE, offset })
      if (mine !== seq.current) return
      offsetRef.current = data.offset ?? offset
      setState({ status: 'ready', rows: data.rows || [], total: data.total ?? (data.rows || []).length, limit: data.limit || PAGE, offset: data.offset ?? offset, problem: null })
      onCount?.(resource.id, data.total ?? (data.rows || []).length)
    } catch (err) {
      if (mine !== seq.current) return
      const c = classifyError(err)
      if (c.kind === 'not_installed') { onGone?.(); return }
      setState((s) => ({ ...s, status: 'error', problem: c }))
    }
  }, [app.id, resource.id, onGone, onCount])

  useEffect(() => { load(0) }, [load])

  const openAdd = useCallback(() => setSheet({ mode: 'add' }), [])
  useEffect(() => registerAdd?.(resource.id, openAdd), [registerAdd, resource.id, openAdd])

  const page = pageInfo({ total: state.total, limit: state.limit, offset: state.offset, count: state.rows.length })
  const shown = useMemo(() => applyView(state.rows, resource, view), [state.rows, resource, view])
  const filtering = view.query.trim() !== '' || Object.values(view.filters).some((v) => v !== '' && v != null)
  const noun = resource.label.toLowerCase()

  const submit = async (values) => {
    if (sheet.mode === 'add') {
      await createSdkRow(app.id, resource.id, values)
    } else {
      await updateSdkRow(app.id, resource.id, sheet.row.id, values)
    }
    const adding = sheet.mode === 'add'
    setSheet(null)
    toast.success(adding ? `Added to ${resource.label}` : 'Changes saved')
    setLive(adding ? `Added to ${resource.label}.` : 'Changes saved.')
    await load(adding ? 0 : offsetRef.current)
    headingRef.current?.focus({ preventScroll: false })
  }

  const remove = async (row) => {
    const name = rowTitle(resource, row)
    const ok = await confirm({
      title: `Delete “${name}”?`,
      message: `This removes it from your ${noun} list for good. It can't be undone.`,
      confirmLabel: 'Delete',
    })
    if (!ok) return
    setBusyRow(row.id)
    try {
      await deleteSdkRow(app.id, resource.id, row.id)
      toast.success('Deleted')
      setLive(`Deleted ${name}.`)
      const lastOnPage = state.rows.length === 1 && state.offset > 0
      await load(lastOnPage ? page.prevOffset : offsetRef.current)
    } catch (err) {
      const c = classifyError(err)
      if (c.kind === 'not_installed') { onGone?.(); return }
      if (c.kind === 'not_found') { toast.info('That was already gone.'); await load(offsetRef.current); return }
      toast.error(friendlyMessage(c.kind, c.message, 'delete it'))
    } finally {
      setBusyRow(null)
    }
  }

  const setSort = (key) => setView((v) => (v.sortKey === key ? { ...v, dir: v.dir === 'asc' ? 'desc' : 'asc' } : { ...v, sortKey: key, dir: key === '_created' ? 'desc' : 'asc' }))

  const headingId = `sa-res-${uid}`
  const loadingFirst = state.status === 'loading'
  const empty = state.status === 'ready' && state.total === 0
  const canAppend = resource.public === 'append' || resource.public === 'read-append'

  return (
    <section className="sa-card" aria-labelledby={headingId} id={`sa-resource-${resource.id}`} data-resource={resource.id}>
      <div className="sa-card-head">
        <div className="sa-grow">
          <h2 id={headingId} className="sa-h2" ref={headingRef} tabIndex={-1}>
            {resource.label}
            {state.status !== 'loading' && state.status !== 'error' && <span className="sa-count-chip" aria-label={`${state.total} in total`}>{state.total}</span>}
          </h2>
          {resource.description && <p className="sa-muted">{resource.description}</p>}
        </div>
        <button type="button" className="primary sa-btn" onClick={openAdd} disabled={state.status === 'error' && state.problem?.kind === 'not_configured'}>
          <span aria-hidden="true">+ </span>Add<span className="sa-sr"> to {resource.label}</span>
        </button>
      </div>

      {loadingFirst && <div className="sa-skeleton" role="status" aria-live="polite" aria-busy="true"><span className="sa-sr">Loading {noun}</span><i /><i /><i /></div>}

      {state.status === 'error' && <InlineProblem kind={state.problem.kind} message={state.problem.message} onRetry={() => load(offsetRef.current)} />}

      {empty && (
        <div className="sa-empty">
          <p className="sa-empty-title">No {noun} yet</p>
          <p className="sa-muted">
            {canAppend ? 'Entries from your customers will appear here as soon as they send them through your public link. You can also add one yourself.' : `Add your first one to get started.`}
          </p>
          <button type="button" className="secondary sa-btn" onClick={openAdd}>Add the first one</button>
        </div>
      )}

      {(state.status === 'ready' || state.status === 'refreshing') && state.total > 0 && (
        <>
          <div className="sa-toolbar" role="group" aria-label={`Sort and filter ${noun}`}>
            {hasText && (
              <div className="sa-tool sa-tool-search">
                <label htmlFor={`${headingId}-q`}>Search</label>
                <input id={`${headingId}-q`} className="sa-input" type="search" value={view.query} onChange={(e) => setView((v) => ({ ...v, query: e.target.value }))} placeholder={`Search ${noun}`} autoComplete="off" />
              </div>
            )}
            <div className="sa-tool">
              <label htmlFor={`${headingId}-s`}>Sort by</label>
              <div className="sa-row">
                <select id={`${headingId}-s`} className="sa-input" value={view.sortKey} onChange={(e) => setView((v) => ({ ...v, sortKey: e.target.value, dir: e.target.value === '_created' ? 'desc' : 'asc' }))}>
                  {sortOptions(resource).map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
                </select>
                <button type="button" className="secondary sa-btn sa-icon-btn" onClick={() => setView((v) => ({ ...v, dir: v.dir === 'asc' ? 'desc' : 'asc' }))} aria-label={`Order: ${view.dir === 'asc' ? 'ascending' : 'descending'}. Tap to reverse.`}>
                  <span aria-hidden="true">{view.dir === 'asc' ? '↑' : '↓'}</span>
                </button>
              </div>
            </div>
            {filters.map((f) => (
              <div className="sa-tool" key={f.key}>
                <label htmlFor={`${headingId}-f-${f.key}`}>{f.label}</label>
                <select id={`${headingId}-f-${f.key}`} className="sa-input" value={view.filters[f.key] ?? ''} onChange={(e) => setView((v) => ({ ...v, filters: { ...v.filters, [f.key]: e.target.value } }))}>
                  <option value="">All</option>
                  {inputKind(f) === 'checkbox'
                    ? [<option key="t" value="true">Yes</option>, <option key="f" value="false">No</option>]
                    : (f.options || []).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
            ))}
            {filtering && (
              <button type="button" className="sa-link" onClick={() => setView((v) => ({ ...v, query: '', filters: {} }))}>Clear search and filters</button>
            )}
          </div>

          {shown.length === 0 ? (
            <div className="sa-empty"><p className="sa-empty-title">Nothing matches</p><p className="sa-muted">Try a different search, or clear the filters.</p></div>
          ) : wide ? (
            <div className="sa-table-wrap">
              <table className="sa-table" data-busy={state.status === 'refreshing' || undefined}>
                <caption className="sa-sr">{resource.label}: {shown.length} shown</caption>
                <thead>
                  <tr>
                    {tableCols.map((f) => (
                      <th key={f.key} scope="col" aria-sort={view.sortKey === f.key ? (view.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
                        <button type="button" className="sa-th" onClick={() => setSort(f.key)}>
                          {shortLabel(f.label)}<span aria-hidden="true">{view.sortKey === f.key ? (view.dir === 'asc' ? ' ↑' : ' ↓') : ''}</span>
                        </button>
                      </th>
                    ))}
                    <th scope="col" aria-sort={view.sortKey === '_created' ? (view.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
                      <button type="button" className="sa-th" onClick={() => setSort('_created')}>Added<span aria-hidden="true">{view.sortKey === '_created' ? (view.dir === 'asc' ? ' ↑' : ' ↓') : ''}</span></button>
                    </th>
                    <th scope="col"><span className="sa-sr">Actions</span></th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((row) => {
                    const name = rowTitle(resource, row)
                    return (
                      <tr key={row.id}>
                        {tableCols.map((f, i) => (
                          <td key={f.key} className={i === 0 ? 'sa-td-title' : undefined} data-kind={inputKind(f)}>{formatCell(f, row[f.key])}</td>
                        ))}
                        <td className="sa-td-date">{formatStamp(row.created_at)}</td>
                        <td className="sa-td-actions">
                          <button type="button" className="secondary sa-btn sa-btn-sm" onClick={() => setSheet({ mode: 'edit', row })} aria-label={`Edit ${name}`}>Edit</button>
                          <button type="button" className="danger-ghost sa-btn sa-btn-sm" onClick={() => remove(row)} disabled={busyRow === row.id} aria-label={`Delete ${name}`}>Delete</button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <ul className="sa-cards" aria-label={resource.label} data-busy={state.status === 'refreshing' || undefined}>
              {shown.map((row) => {
                const name = rowTitle(resource, row)
                const [titleField, ...rest] = columns
                const secondary = rest.filter((f) => row[f.key] !== null && row[f.key] !== undefined && row[f.key] !== '').slice(0, 4)
                return (
                  <li key={row.id} className="sa-rowcard">
                    <p className="sa-rowcard-title">{formatCell(titleField, row[titleField.key])}</p>
                    {secondary.length > 0 && (
                      <dl className="sa-rowcard-meta">
                        {secondary.map((f) => (
                          <div key={f.key}><dt>{f.label}</dt><dd>{formatCell(f, row[f.key])}</dd></div>
                        ))}
                      </dl>
                    )}
                    <p className="sa-rowcard-date">Added {formatStamp(row.created_at)}</p>
                    <div className="sa-rowcard-actions">
                      <button type="button" className="secondary sa-btn" onClick={() => setSheet({ mode: 'edit', row })} aria-label={`Edit ${name}`}>Edit</button>
                      <button type="button" className="danger-ghost sa-btn" onClick={() => remove(row)} disabled={busyRow === row.id} aria-label={`Delete ${name}`}>Delete</button>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}

          <div className="sa-pager">
            <p className="sa-muted" role="status" aria-live="polite">
              Showing {page.from}&ndash;{page.to} of {page.total}
              {page.partial && (filtering || view.sortKey !== '_created') ? `. Search, filters and sorting look at these ${state.rows.length} only.` : ''}
            </p>
            {(page.hasPrev || page.hasNext) && (
              <div className="sa-row">
                <button type="button" className="secondary sa-btn" disabled={!page.hasPrev || state.status === 'refreshing'} onClick={() => load(page.prevOffset)}>Previous</button>
                <button type="button" className="secondary sa-btn" disabled={!page.hasNext || state.status === 'refreshing'} onClick={() => load(page.nextOffset)}>Next</button>
              </div>
            )}
          </div>
        </>
      )}

      <p className="sa-sr" role="status" aria-live="polite">{live}</p>

      {sheet && (
        <FormSheet
          key={sheet.mode === 'edit' ? `edit-${sheet.row.id}` : 'add'}
          title={sheet.mode === 'add' ? `Add to ${resource.label}` : `Edit ${rowTitle(resource, sheet.row)}`}
          fields={resource.fields}
          mode={sheet.mode === 'add' ? 'create' : 'edit'}
          row={sheet.mode === 'edit' ? sheet.row : null}
          initial={sheet.mode === 'add' ? formDefaults(resource.fields) : formFromRow(resource.fields, sheet.row)}
          submitLabel={sheet.mode === 'add' ? 'Add' : 'Save changes'}
          onSubmit={submit}
          onClose={() => setSheet(null)}
          onGone={onGone}
          formId={`${uid}-form`}
        />
      )}
    </section>
  )
}
