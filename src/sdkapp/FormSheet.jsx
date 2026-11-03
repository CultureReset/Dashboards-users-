import { useEffect, useId, useRef, useState } from 'react'
import Sheet from './Sheet'
import { FormFields } from './fields'
import { useConfirm } from '../components/ConfirmSheet'
import { classifyError } from './api'
import {
  collectForm, errorSummary, explainServerErrors, firstErrorKey, friendlyMessage,
} from './validate'

// A form generated from field definitions, in a sheet.
//
//   fields    [{ key, label, type, ... }]    what to ask
//   initial   raw form state                  formDefaults(...) or formFromRow(...)
//   mode      'create' | 'edit'              what collectForm sends (see validate.js)
//   row       the stored row, for 'edit'     so only changed fields are sent
//   onSubmit(values)                         resolves when saved; may throw an ApiError
//   onGone()                                 the app was uninstalled while this was open
//
// Errors stay with the fields they belong to, in plain words, and focus goes to
// the first one. A failed save keeps everything typed so far.
export default function FormSheet({
  title, fields, initial, mode = 'create', row = null, submitLabel = 'Save', onSubmit, onClose, onGone, intro, formId,
}) {
  const [form, setForm] = useState(initial)
  const [errors, setErrors] = useState({})
  const [banner, setBanner] = useState('')
  const [busy, setBusy] = useState(false)
  const [announce, setAnnounce] = useState('')
  const confirm = useConfirm()
  const uid = useId()
  const root = useRef(null)
  const dirty = JSON.stringify(form) !== JSON.stringify(initial)

  // Focus the first field on open (the focus trap looks for [data-autofocus]).
  useEffect(() => {
    root.current?.querySelector('[data-field]')?.setAttribute('data-autofocus', '')
  }, [])

  const focusField = (key) => {
    requestAnimationFrame(() => root.current?.querySelector(`[data-field="${CSS.escape(key)}"]`)?.focus())
  }

  const requestClose = async () => {
    if (busy) return
    if (dirty) {
      const ok = await confirm({
        title: 'Discard your changes?',
        message: "What you've typed here hasn't been saved.",
        confirmLabel: 'Discard',
        cancelLabel: 'Keep editing',
      })
      if (!ok) return
    }
    onClose()
  }

  const change = (key, value) => {
    setForm((f) => ({ ...f, [key]: value }))
    if (errors[key]) setErrors((e) => { const next = { ...e }; delete next[key]; return next })
  }

  const submit = async (e) => {
    e.preventDefault()
    if (busy) return
    setBanner('')
    const checked = collectForm(fields, form, { mode, row })
    if (!checked.ok) {
      setErrors(checked.errors)
      setAnnounce(errorSummary(fields, checked.errors))
      focusField(firstErrorKey(fields, checked.errors))
      return
    }
    setErrors({})
    if (mode === 'edit' && !checked.changed) { onClose(); return }
    setBusy(true)
    try {
      await onSubmit(checked.values)
    } catch (err) {
      const c = classifyError(err)
      if (c.kind === 'not_installed') { onGone?.(); return }
      if (c.kind === 'invalid' && c.errors) {
        const mapped = explainServerErrors(c.errors, fields)
        const { _form: stray, ...fieldErrors } = mapped
        setErrors(fieldErrors)
        setBanner(stray || '')
        setAnnounce(errorSummary(fields, fieldErrors) || stray || '')
        if (Object.keys(fieldErrors).length) focusField(firstErrorKey(fields, fieldErrors))
      } else {
        setBanner(friendlyMessage(c.kind, c.message, 'save'))
      }
    } finally {
      setBusy(false)
    }
  }

  const errorCount = Object.keys(errors).length

  return (
    <Sheet title={title} onClose={requestClose}>
      <form ref={root} className="sa-form" noValidate onSubmit={submit} aria-busy={busy || undefined}>
        {intro && <p className="sa-muted">{intro}</p>}
        {errorCount > 0 && (
          <p className="sa-banner" role="alert">
            {errorCount === 1 ? '1 thing needs your attention. It is marked below.' : `${errorCount} things need your attention. They are marked below.`}
          </p>
        )}
        {banner && <p className="sa-banner" role="alert">{banner}</p>}
        <FormFields fields={fields} form={form} errors={errors} onChange={change} idPrefix={formId || `f${uid.replace(/:/g, '')}`} disabled={busy} />
        <p className="sa-sr" role="status" aria-live="polite">{announce}</p>
        <div className="sa-form-actions">
          <button type="button" className="secondary sa-btn" onClick={requestClose} disabled={busy}>Cancel</button>
          <button type="submit" className="primary sa-btn" disabled={busy}>{busy ? 'Saving…' : submitLabel}</button>
        </div>
      </form>
    </Sheet>
  )
}
