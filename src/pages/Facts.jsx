import { useCallback, useEffect, useMemo, useState } from 'react'
import { fetchFactQuestions, saveFactAnswers } from '../lib/facts'
import { useAuth } from '../lib/AuthContext'

// Answer what guests ask. Every question, its group and its allowed values come
// from the API; the owner only picks. Unanswered questions are not sent.

const humanize = (s) => String(s || 'General').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())

function Question({ q, answer, onChange }) {
  const id = `fact-${q.fact}`
  const set = (next) => onChange(q.fact, next)
  const mode = answer?.maybe ? 'maybe' : answer?.unknown ? 'unknown' : answer ? 'value' : ''

  let control
  if (q.control === 'yesno') {
    const current = mode === 'value' ? String(answer.value) : mode
    control = (
      <div className="facts-choices" role="radiogroup" aria-labelledby={`${id}-label`}>
        {[['true', 'Yes'], ['false', 'No'], ['maybe', 'Sometimes'], ['unknown', 'Not sure']].map(([v, label]) => (
          <button
            key={v}
            type="button"
            role="radio"
            aria-checked={current === v}
            className={current === v ? 'primary' : 'secondary'}
            onClick={() => {
              if (current === v) return set(null)
              set(v === 'maybe' ? { maybe: true } : v === 'unknown' ? { unknown: true } : { value: v === 'true' })
            }}
          >
            {label}
          </button>
        ))}
      </div>
    )
  } else if (q.control === 'choice') {
    control = (
      <select
        id={id}
        value={mode === 'value' ? answer.value : mode === 'unknown' ? '__unknown' : ''}
        onChange={(e) => {
          const v = e.target.value
          set(v === '' ? null : v === '__unknown' ? { unknown: true } : { value: v })
        }}
      >
        <option value="">Skip</option>
        {q.choices.map((c) => (
          <option key={c.value} value={c.value}>{c.label || c.value}</option>
        ))}
        <option value="__unknown">Not sure</option>
      </select>
    )
  } else {
    control = (
      <div className="facts-inline">
        <input
          id={id}
          type={q.control === 'number' ? 'number' : 'text'}
          inputMode={q.control === 'number' ? 'decimal' : undefined}
          step={q.control === 'number' ? 'any' : undefined}
          value={mode === 'value' ? answer.value : ''}
          disabled={mode === 'unknown'}
          onChange={(e) => set(e.target.value === '' ? null : { value: e.target.value })}
          placeholder={mode === 'unknown' ? 'Not sure' : 'Your answer'}
        />
        <button
          type="button"
          role="switch"
          aria-checked={mode === 'unknown'}
          className={mode === 'unknown' ? 'primary' : 'secondary'}
          onClick={() => set(mode === 'unknown' ? null : { unknown: true })}
        >
          Not sure
        </button>
      </div>
    )
  }

  return (
    <div className="facts-question">
      <label id={`${id}-label`} htmlFor={q.control === 'yesno' ? undefined : id}>{q.label}</label>
      {control}
    </div>
  )
}

export default function Facts({ onChanged }) {
  const { gcrSlug } = useAuth()
  const [questions, setQuestions] = useState(null)
  const [error, setError] = useState('')
  const [answers, setAnswers] = useState({})
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  const load = useCallback(async () => {
    setError('')
    try {
      setQuestions(await fetchFactQuestions())
    } catch (err) {
      setQuestions(null)
      setError(err.isNetworkError ? 'Could not reach the server — check your connection.' : err.message || 'Could not load your questions.')
    }
  }, [])

  useEffect(() => { setAnswers({}); setQuestions(null); load() }, [load, gcrSlug])

  const groups = useMemo(() => {
    const by = new Map()
    for (const q of questions || []) {
      if (!by.has(q.domain)) by.set(q.domain, [])
      by.get(q.domain).push(q)
    }
    return [...by.entries()]
  }, [questions])

  const filled = Object.keys(answers).length

  const onChange = (fact, next) =>
    setAnswers((prev) => {
      const copy = { ...prev }
      if (next === null) delete copy[fact]
      else copy[fact] = next
      return copy
    })

  async function save() {
    setSaving(true)
    setMessage('')
    setError('')
    try {
      const payload = Object.entries(answers).map(([fact, a]) => ({ fact, ...a }))
      const { saved, counting_now: counting } = await saveFactAnswers(payload)
      setMessage(
        counting > 0
          ? `Saved ${saved} ${saved === 1 ? 'answer' : 'answers'}. Guests searching for these will now find you.`
          : `Saved ${saved} ${saved === 1 ? 'answer' : 'answers'}. They are waiting for review before guests see them.`,
      )
      setAnswers({})
      await load()
      onChanged?.()
    } catch (err) {
      setError(err.message || 'Could not save your answers.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="panel facts-page">
      <h2>Questions guests ask</h2>
      <p className="claim-sub">
        These are things guests search for that we do not know about your business yet. Answer what you can;
        anything you skip stays on this list.
      </p>

      {error && (
        <p className="auth-error" role="alert">
          {error} <button type="button" className="secondary" onClick={load}>Try again</button>
        </p>
      )}
      {message && <p className="avail-message" role="status">{message}</p>}

      {!questions && !error && <p className="claim-sub" role="status">Loading your questions…</p>}

      {questions && questions.length === 0 && (
        <p className="claim-sub" role="status">Nothing to answer right now. Every question we know to ask is answered.</p>
      )}

      {groups.map(([domain, list]) => (
        <fieldset key={domain} className="facts-group">
          <legend>{humanize(domain)} <span className="count">({list.length})</span></legend>
          {list.map((q) => (
            <Question key={q.fact} q={q} answer={answers[q.fact]} onChange={onChange} />
          ))}
        </fieldset>
      ))}

      {questions && questions.length > 0 && (
        <div className="facts-save">
          <button type="button" className="primary" disabled={!filled || saving} onClick={save}>
            {saving ? 'Saving…' : filled ? `Save ${filled} ${filled === 1 ? 'answer' : 'answers'}` : 'Answer a question to save'}
          </button>
        </div>
      )}
    </section>
  )
}
