import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api, ApiError } from '../lib/apiClient'
import endpoints from '../lib/endpoints'
import { useAuth } from '../lib/AuthContext'
import { describeError, diffProfile, groupColumns, humanize, kindOf, serverFieldErrors, toForm } from '../lib/businessProfile'

// The business's own profile (the `entity` row). The API says which columns an owner may edit; this page renders
// whatever it is told, groups them, and sends back only what changed. No column is named here, and no slug is sent:
// the API knows the business from the session.

function Tri({ id, value, onChange, invalid, describedBy }) {
  return (
    <div className="profile-tri" role="radiogroup" aria-labelledby={`${id}-label`} aria-describedby={describedBy} aria-invalid={invalid || undefined}>
      {[['true', 'Yes'], ['false', 'No'], ['', 'Not set']].map(([v, label]) => (
        <button key={label} type="button" role="radio" aria-checked={value === v} className={value === v ? 'is-on' : ''} onClick={() => onChange(v)}>{label}</button>
      ))}
    </div>
  )
}

function Field({ col, value, error, onChange }) {
  const id = `profile-${col.name}`
  const kind = kindOf(col)
  const errId = error ? `${id}-error` : undefined
  const common = { id, name: col.name, value, 'aria-invalid': error ? 'true' : undefined, 'aria-describedby': errId, onChange: (e) => onChange(col.name, e.target.value) }
  let control
  if (kind === 'boolean') control = <Tri id={id} value={value} invalid={!!error} describedBy={errId} onChange={(v) => onChange(col.name, v)} />
  else if (kind === 'textarea') control = <textarea {...common} rows={4} />
  else if (kind === 'integer' || kind === 'number') control = <input {...common} type="text" inputMode={kind === 'integer' ? 'numeric' : 'decimal'} autoComplete="off" />
  else if (kind === 'date' || kind === 'time') control = <input {...common} type={kind} />
  else control = <input {...common} type={kind} autoComplete="off" {...(kind === 'url' ? { inputMode: 'url', autoCapitalize: 'none' } : {})} />
  return (
    <div className={`editor-field profile-field${kind === 'textarea' ? ' is-wide' : ''}`} data-field={col.name}>
      <label id={`${id}-label`} htmlFor={kind === 'boolean' ? undefined : id}><span>{humanize(col.name)}</span></label>
      {control}
      {error && <span className="editor-error" id={errId} role="alert">{error}</span>}
    </div>
  )
}

export default function BusinessProfile({ onDirtyChange, onSaved }) {
  const { gcrSlug } = useAuth()
  const [state, setState] = useState({ status: 'loading' }) // loading | ready | error
  const [form, setForm] = useState({})
  const [serverErrors, setServerErrors] = useState({})
  const [notice, setNotice] = useState(null) // { kind: 'ok' | 'error', text, extra }
  const [saving, setSaving] = useState(false)
  const root = useRef(null)

  const load = useCallback(async () => {
    setState({ status: 'loading' })
    setNotice(null)
    setServerErrors({})
    try {
      const data = await api.get(endpoints.business.profile())
      const editable = Array.isArray(data?.editable) ? data.editable : []
      setState({ status: 'ready', profile: data?.profile || {}, editable })
      setForm(toForm(data?.profile, editable))
    } catch (err) {
      setState({ status: 'error', problem: describeError(err instanceof ApiError ? err : new ApiError(err?.message || 'Request failed')) })
    }
  }, [])
  useEffect(() => { load() }, [load, gcrSlug])

  const ready = state.status === 'ready'
  const { values, errors: clientErrors } = useMemo(() => (ready ? diffProfile(state.editable, state.profile, form) : { values: {}, errors: {} }), [ready, state, form])
  const changed = Object.keys(values).length
  const dirty = changed > 0
  const groups = useMemo(() => (ready ? groupColumns(state.editable) : []), [ready, state])

  useEffect(() => { onDirtyChange?.(dirty) }, [dirty, onDirtyChange])
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange])
  useEffect(() => {
    if (!dirty) return undefined
    const warn = (e) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  const focusFirst = (names) => {
    const first = state.editable.map((c) => c.name).find((n) => names.includes(n))
    if (!first) return
    requestAnimationFrame(() => {
      const el = root.current?.querySelector(`[data-field="${first}"]`)
      el?.scrollIntoView({ block: 'center' })
      el?.querySelector('input, textarea, button')?.focus({ preventScroll: true })
    })
  }

  const onChange = (name, value) => {
    setForm((f) => ({ ...f, [name]: value }))
    setServerErrors((e) => { if (!(name in e)) return e; const { [name]: _gone, ...rest } = e; return rest })
    setNotice(null)
  }

  async function save() {
    if (!dirty || saving) return
    const bad = Object.keys(clientErrors)
    if (bad.length) { setNotice({ kind: 'error', text: 'Fix the highlighted fields, then save again.' }); focusFirst(bad); return }
    setSaving(true)
    setNotice(null)
    try {
      const res = await api.patch(endpoints.business.profile(), values)
      const profile = res?.profile || { ...state.profile, ...values }
      setState((s) => ({ ...s, profile }))
      setForm(toForm(profile, state.editable))
      setServerErrors({})
      const n = res?.changed?.length ?? changed
      setNotice({ kind: 'ok', text: `Saved ${n} ${n === 1 ? 'change' : 'changes'}.` })
      onSaved?.(profile)
    } catch (err) {
      if (err instanceof ApiError && err.status === 400 && err.body?.fields) {
        const { shown, other } = serverFieldErrors(err.body, state.editable)
        setServerErrors(shown)
        setNotice({ kind: 'error', text: err.message || 'Some fields are not valid.', extra: other })
        focusFirst(Object.keys(shown))
      } else {
        const d = describeError(err instanceof ApiError ? err : new ApiError(err?.message || 'Request failed'))
        setNotice({ kind: 'error', text: d.text })
      }
    } finally {
      setSaving(false)
    }
  }

  const discard = () => { setForm(toForm(state.profile, state.editable)); setServerErrors({}); setNotice(null) }

  if (state.status === 'loading') {
    return <section className="panel profile-page" aria-busy="true"><h2>Business profile</h2><p className="claim-sub" role="status">Loading your profile…</p>
      <div className="profile-skeleton" aria-hidden="true"><span /><span /><span /></div></section>
  }
  if (state.status === 'error') {
    return (
      <section className="panel profile-page">
        <h2>Business profile</h2>
        <div className="profile-problem" role="alert">
          <p>{state.problem.text}</p>
          {state.problem.kind !== 'missing' && <button type="button" className="primary" onClick={load}>Try again</button>}
          {state.problem.kind === 'missing' && <button type="button" className="secondary" onClick={load}>Check again</button>}
        </div>
      </section>
    )
  }
  if (!state.editable.length) {
    return (
      <section className="panel profile-page">
        <h2>Business profile</h2>
        <p className="claim-sub" role="status">There is nothing here for you to edit yet. Your sections below hold the rest of your business information.</p>
        <button type="button" className="secondary" onClick={load}>Refresh</button>
      </section>
    )
  }

  const allErrors = { ...clientErrors, ...serverErrors }
  return (
    <section className="panel profile-page" ref={root}>
      <h2>Business profile</h2>
      <p className="claim-sub">The basics guests see about you. Change what you need; only the fields you edit are saved.</p>
      {notice?.kind === 'ok' && (
        <div className="profile-notice is-ok" role="status">
          <strong>{notice.text}</strong> Guest pages can take about 2 minutes to show the update, because they are cached for a short while.
        </div>
      )}
      {notice?.kind === 'error' && (
        <div className="profile-notice is-error" role="alert">
          <strong>{notice.text}</strong>
          {notice.extra?.length > 0 && <ul>{notice.extra.map((t) => <li key={t}>{t}</li>)}</ul>}
        </div>
      )}
      <form onSubmit={(e) => { e.preventDefault(); save() }} noValidate>
        {groups.map((g) => (
          <fieldset className="profile-group" key={g.key}>
            <legend>{g.label}</legend>
            <div className="profile-grid">
              {g.columns.map((col) => <Field key={col.name} col={col} value={form[col.name] ?? ''} error={allErrors[col.name]} onChange={onChange} />)}
            </div>
          </fieldset>
        ))}
        <div className="profile-savebar" data-dirty={dirty || undefined}>
          <span className="profile-savebar-text" role="status">{dirty ? `${changed} unsaved ${changed === 1 ? 'change' : 'changes'}` : 'No changes'}</span>
          <button type="button" className="secondary" onClick={discard} disabled={!dirty || saving}>Discard</button>
          <button type="submit" className="primary" disabled={!dirty || saving}>{saving ? 'Saving…' : 'Save changes'}</button>
        </div>
      </form>
    </section>
  )
}
