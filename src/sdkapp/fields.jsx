import { useState } from 'react'
import { inputKind, normalizeField } from './validate'

// One input per field, chosen from the field's type alone (validate.inputKind).
// Every control has a <label> bound to it, its help and its error are tied to it
// with aria-describedby, and an invalid one says so with aria-invalid. Inputs are
// 16px so a phone does not zoom into them.

const IMG_OK = /^https?:\/\/\S+$/i

function Preview({ url }) {
  const [failed, setFailed] = useState('')
  if (!IMG_OK.test(String(url || '').trim()) || failed === url) return null
  return (
    <img className="sa-preview" src={String(url).trim()} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(url)} />
  )
}

/**
 * @param {object} p
 * @param {object} p.field        a field definition (any shape normalizeField accepts)
 * @param {string|boolean} p.value  the form's raw value for it
 * @param {(value: string|boolean) => void} p.onChange
 * @param {string} [p.error]      a sentence, shown under the input
 * @param {string} p.idPrefix     unique per form, so two forms on one page never share an id
 * @param {boolean} [p.disabled]
 */
export function FieldInput({ field, value, onChange, error, idPrefix, disabled = false }) {
  const f = normalizeField(field)
  const kind = inputKind(f)
  const id = `${idPrefix}-${f.key}`
  const helpId = f.help ? `${id}-help` : undefined
  const errId = error ? `${id}-err` : undefined
  const describedBy = [helpId, errId].filter(Boolean).join(' ') || undefined
  const common = {
    id,
    name: f.key,
    disabled,
    'aria-invalid': error ? 'true' : undefined,
    'aria-describedby': describedBy,
    'aria-required': f.required ? 'true' : undefined,
    'data-field': f.key,
  }
  const set = (e) => onChange(e.target.value)
  const text = typeof value === 'string' ? value : ''

  let control
  switch (kind) {
    case 'textarea':
    case 'json':
      control = (
        <>
          <textarea {...common} className={`sa-input${kind === 'json' ? ' sa-mono' : ''}`} rows={kind === 'json' ? 5 : 4} value={text} onChange={set} placeholder={f.placeholder || undefined} spellCheck={kind === 'json' ? false : undefined} />
          {kind === 'textarea' && Number.isInteger(f.max_length) && (
            <p className={`sa-count${text.length > f.max_length ? ' sa-over' : ''}`} aria-hidden="true">{text.length} / {f.max_length}</p>
          )}
        </>
      )
      break
    case 'select':
      control = (
        <select {...common} className="sa-input" value={text} onChange={set}>
          <option value="">{f.required ? 'Choose one…' : 'Not chosen'}</option>
          {(f.options || []).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      )
      break
    case 'number':
    case 'integer':
    case 'money':
      control = (
        <input
          {...common}
          className="sa-input"
          type="number"
          inputMode={kind === 'integer' ? 'numeric' : 'decimal'}
          step={kind === 'integer' ? 1 : kind === 'money' ? 0.01 : 'any'}
          min={typeof f.min === 'number' ? f.min : undefined}
          max={typeof f.max === 'number' ? f.max : undefined}
          value={text}
          onChange={set}
          placeholder={f.placeholder || undefined}
        />
      )
      break
    case 'date':
      control = <input {...common} className="sa-input" type="date" value={text} onChange={set} />
      break
    case 'datetime':
      control = <input {...common} className="sa-input" type="datetime-local" value={text} onChange={set} />
      break
    case 'checkbox':
      return (
        <div className="sa-field" data-invalid={error ? 'true' : undefined}>
          <label className="sa-switch" htmlFor={id}>
            <input {...common} type="checkbox" role="switch" checked={value === true} onChange={(e) => onChange(e.target.checked)} />
            <span className="sa-track" aria-hidden="true"><span className="sa-thumb" /></span>
            <span className="sa-switch-text">{f.label}</span>
          </label>
          {f.help && <p id={helpId} className="sa-help">{f.help}</p>}
          {error && <p id={errId} className="sa-error">{error}</p>}
        </div>
      )
    default: {
      const type = kind === 'email' ? 'email' : kind === 'tel' ? 'tel' : kind === 'url' || kind === 'image' ? 'url' : 'text'
      control = (
        <>
          <input
            {...common}
            className="sa-input"
            type={type}
            inputMode={kind === 'email' ? 'email' : kind === 'tel' ? 'tel' : kind === 'url' || kind === 'image' ? 'url' : undefined}
            autoComplete="off"
            value={text}
            onChange={set}
            placeholder={f.placeholder || (kind === 'image' ? 'https://…' : undefined)}
          />
          {kind === 'image' && <Preview url={text} />}
        </>
      )
    }
  }

  return (
    <div className="sa-field" data-invalid={error ? 'true' : undefined}>
      <label htmlFor={id} className="sa-label">
        <span>{f.label}</span>
        {f.required && <span className="sa-req">Required</span>}
      </label>
      {control}
      {f.help && <p id={helpId} className="sa-help">{f.help}</p>}
      {error && <p id={errId} className="sa-error">{error}</p>}
    </div>
  )
}

/** A list of fields bound to one form state. */
export function FormFields({ fields, form, errors, onChange, idPrefix, disabled }) {
  return (
    <>
      {(fields || []).map((raw) => {
        const f = normalizeField(raw)
        return (
          <FieldInput
            key={f.key}
            field={f}
            value={form[f.key]}
            error={errors?.[f.key]}
            idPrefix={idPrefix}
            disabled={disabled}
            onChange={(v) => onChange(f.key, v)}
          />
        )
      })}
    </>
  )
}
