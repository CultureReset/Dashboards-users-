import { useId, useRef, useState } from 'react'
import { FormFields } from './fields'
import { useToast } from '../components/Toast'
import { classifyError, saveSdkSettings } from './api'
import {
  errorSummary, explainServerErrors, firstErrorKey, friendlyMessage, settingsPatch, settingsToForm,
} from './validate'

/**
 * The settings form, generated from the settings schema and saved with
 * PATCH /api/apps/<id>/settings { settings: { only the changed keys } }.
 * A 422 { errors: { key: message } } lands under the matching field.
 */
export default function SettingsSection({ app, onGone, onSaved }) {
  const schema = app.settings.schema
  const [values, setValues] = useState(app.settings.values || {})
  const [form, setForm] = useState(() => settingsToForm(schema, app.settings.values))
  const [errors, setErrors] = useState({})
  const [banner, setBanner] = useState('')
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('')
  const toast = useToast()
  const uid = useId().replace(/:/g, '')
  const root = useRef(null)
  const baseline = settingsToForm(schema, values)
  const dirty = JSON.stringify(form) !== JSON.stringify(baseline)

  const change = (key, value) => {
    setForm((f) => ({ ...f, [key]: value }))
    setStatus('')
    if (errors[key]) setErrors((e) => { const next = { ...e }; delete next[key]; return next })
  }

  const focusField = (key) => requestAnimationFrame(() => root.current?.querySelector(`[data-field="${CSS.escape(key)}"]`)?.focus())

  const submit = async (e) => {
    e.preventDefault()
    if (busy) return
    setBanner('')
    const checked = settingsPatch(schema, form, values)
    if (!checked.ok) {
      setErrors(checked.errors)
      setStatus(errorSummary(schema, checked.errors))
      focusField(firstErrorKey(schema, checked.errors))
      return
    }
    setErrors({})
    if (!checked.changed) { setStatus('Nothing has changed.'); return }
    setBusy(true)
    try {
      const res = await saveSdkSettings(app.id, checked.values)
      const next = res?.settings && typeof res.settings === 'object' ? res.settings : { ...values, ...checked.values }
      setValues(next)
      setForm(settingsToForm(schema, next))
      setStatus('Settings saved.')
      toast.success('Settings saved')
      onSaved?.(next)
    } catch (err) {
      const c = classifyError(err)
      if (c.kind === 'not_installed') { onGone?.(); return }
      if (c.kind === 'invalid' && c.errors) {
        const mapped = explainServerErrors(c.errors, schema)
        const { _form: stray, ...fieldErrors } = mapped
        setErrors(fieldErrors)
        setBanner(stray || '')
        setStatus(errorSummary(schema, fieldErrors) || stray || '')
        if (Object.keys(fieldErrors).length) focusField(firstErrorKey(schema, fieldErrors))
      } else {
        const msg = friendlyMessage(c.kind, c.message, 'save your settings')
        setBanner(msg)
        toast.error(msg)
      }
    } finally {
      setBusy(false)
    }
  }

  const count = Object.keys(errors).length
  return (
    <section className="sa-card" aria-labelledby={`sa-settings-${uid}`} id="sa-settings">
      <h2 id={`sa-settings-${uid}`} className="sa-h2" tabIndex={-1}>Settings</h2>
      <p className="sa-muted">How {app.name} behaves for your business. Changes take effect as soon as you save.</p>
      <form ref={root} className="sa-form" noValidate onSubmit={submit} aria-busy={busy || undefined}>
        {count > 0 && <p className="sa-banner" role="alert">{count === 1 ? '1 thing needs your attention. It is marked below.' : `${count} things need your attention. They are marked below.`}</p>}
        {banner && <p className="sa-banner" role="alert">{banner}</p>}
        <FormFields fields={schema} form={form} errors={errors} onChange={change} idPrefix={`${uid}-set`} disabled={busy} />
        <div className="sa-form-actions sa-form-actions-inline">
          <button type="submit" className="primary sa-btn" disabled={busy || !dirty}>{busy ? 'Saving…' : 'Save settings'}</button>
          <p className="sa-save-status" role="status" aria-live="polite">{status || (dirty ? 'You have unsaved changes.' : '')}</p>
        </div>
      </form>
    </section>
  )
}
