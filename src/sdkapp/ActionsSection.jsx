import { useId, useState } from 'react'
import FormSheet from './FormSheet'
import { useConfirm } from '../components/ConfirmSheet'
import { useToast } from '../components/Toast'
import { classifyError, runSdkAction } from './api'
import { actionPlan, formDefaults, friendlyMessage, summarizeResult } from './validate'

/**
 * Each declared action as a button.
 *
 *   handler / read   run it (POST /api/apps/<id>/actions/<action>), after a
 *                    confirm sheet when it changes things, sends messages or is
 *                    destructive (validate.actionPlan decides, and words it)
 *   create           the same as the resource's Add form: the button opens it
 *   update           no button: it is the Edit button on each row
 *
 * The outcome is a toast and a result panel (aria-live) under the action.
 */
export default function ActionsSection({ app, onGone, openAdd, scrollToResource }) {
  const [results, setResults] = useState({}) // id -> { ok, headline, items, error }
  const [running, setRunning] = useState(null)
  const [asking, setAsking] = useState(null) // action whose input form is open
  const confirm = useConfirm()
  const toast = useToast()
  const uid = useId().replace(/:/g, '')

  const execute = async (action, input) => {
    setRunning(action.id)
    try {
      const data = await runSdkAction(app.id, action.id, input)
      const out = summarizeResult(data?.result)
      setResults((r) => ({ ...r, [action.id]: { ok: true, ...out } }))
      toast.success(`${action.label}: ${out.headline.replace(/:$/, '')}`)
      return true
    } catch (err) {
      const c = classifyError(err)
      if (c.kind === 'not_installed') { onGone?.(); return false }
      const msg = friendlyMessage(c.kind, c.message, `run ${action.label.toLowerCase()}`)
      setResults((r) => ({ ...r, [action.id]: { ok: false, error: msg } }))
      toast.error(msg)
      throw err
    } finally {
      setRunning(null)
    }
  }

  const start = async (action, plan) => {
    if (plan.needsInput) { setAsking(action); return }
    try {
      await go(action, plan, {})
    } catch {
      // already shown: a toast and the result panel under the action
    }
  }

  const go = async (action, plan, input) => {
    if (plan.confirm.needed) {
      const ok = await confirm({
        title: plan.confirm.title,
        message: plan.confirm.message,
        confirmLabel: plan.confirm.confirmLabel,
        danger: plan.confirm.danger,
      })
      if (!ok) return false
    }
    return execute(action, input)
  }

  if (!app.actions.length) return null

  return (
    <section className="sa-card" aria-labelledby={`sa-actions-${uid}`} id="sa-actions">
      <h2 id={`sa-actions-${uid}`} className="sa-h2" tabIndex={-1}>Actions</h2>
      <p className="sa-muted">Things {app.name} can do for you on request. Anything that changes your business asks you first.</p>
      <ul className="sa-actions">
        {app.actions.map((action) => {
          const plan = actionPlan(action, app)
          const result = results[action.id]
          const label = action.label
          const isRunning = running === action.id
          return (
            <li key={action.id} className="sa-action" data-action={action.id}>
              <div className="sa-grow">
                <p className="sa-action-title">{label}</p>
                <p className="sa-muted">{action.summary}</p>
              </div>
              {plan.mode === 'info' ? (
                <p className="sa-muted sa-action-note">
                  {plan.resource ? <>Use <button type="button" className="sa-link" onClick={() => scrollToResource(plan.resource)}>Edit on each entry</button> above.</> : 'Use Edit on each entry.'}
                </p>
              ) : (
                <button
                  type="button"
                  className={`${plan.confirm.danger ? 'danger-ghost' : 'secondary'} sa-btn`}
                  disabled={!!running}
                  aria-busy={isRunning || undefined}
                  onClick={() => {
                    if (plan.mode === 'add') openAdd(plan.resource)
                    else start(action, plan)
                  }}
                >
                  {isRunning ? 'Working\u2026' : label}
                </button>
              )}
              <div className="sa-result-slot" role="status" aria-live="polite">
                {result?.ok && (
                  <div className="sa-result" data-ok="true">
                    <p><strong>{result.headline}</strong></p>
                    {result.items.length > 0 && (
                      <dl className="sa-result-list">
                        {result.items.map((it) => <div key={it.label}><dt>{it.label}</dt><dd>{it.value}</dd></div>)}
                      </dl>
                    )}
                  </div>
                )}
                {result && !result.ok && <p className="sa-result sa-result-bad" role="alert">{result.error}</p>}
              </div>
            </li>
          )
        })}
      </ul>

      {asking && (() => {
        const plan = actionPlan(asking, app)
        return (
          <FormSheet
            title={asking.label}
            intro={asking.summary}
            fields={asking.input}
            initial={formDefaults(asking.input)}
            mode="create"
            submitLabel={plan.confirm.needed ? 'Continue' : asking.label}
            formId={`${uid}-in`}
            onClose={() => setAsking(null)}
            onGone={onGone}
            onSubmit={async (values) => {
              // Confirm on top of the form, so "Cancel" returns to what was typed.
              const ok = await go(asking, plan, values)
              if (ok) setAsking(null)
            }}
          />
        )
      })()}
    </section>
  )
}
