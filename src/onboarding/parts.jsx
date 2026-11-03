import { useSlow } from './hooks'

/** A big on/off switch. The whole 44px-tall control is the touch target. */
export function Switch({ checked, onChange, label, disabled }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      className="ob-switch"
      onClick={() => onChange(!checked)}
    >
      <span className="ob-switch-track" aria-hidden="true">
        <span className="ob-switch-thumb" />
      </span>
    </button>
  )
}

/** Spinner with a message that appears if the wait drags on. */
export function Loading({ what }) {
  const slow = useSlow(true)
  return (
    <div className="ob-loading" role="status" aria-live="polite">
      <div className="spinner" aria-hidden="true" />
      <p>{slow ? 'This is taking longer than usual. Your connection may be slow. You can keep waiting, or skip this step.' : `Loading ${what}…`}</p>
    </div>
  )
}

/** An error with a way out. */
export function Problem({ message, onRetry }) {
  return (
    <div className="ob-note ob-note--error" role="alert">
      <p>{message}</p>
      {onRetry && <button type="button" className="ob-btn ob-btn--ghost" onClick={onRetry}>Try again</button>}
    </div>
  )
}

/** A friendly "nothing here" or "not available" message. */
export function Note({ children }) {
  return <div className="ob-note" role="status"><p>{children}</p></div>
}

/** Back / Skip / Continue. Every button is disabled while something is saving. */
export function Footer({ onBack, onSkip, onContinue, continueLabel = 'Continue', busy, canBack = true, canSkip = true, continueDisabled, hint }) {
  return (
    <footer className="ob-foot">
      {hint && <p className="ob-foot-hint" role="status">{hint}</p>}
      <div className="ob-foot-row">
        <button type="button" className="ob-btn ob-btn--ghost" onClick={onBack} disabled={busy || !canBack}>Back</button>
        {canSkip && <button type="button" className="ob-btn ob-btn--ghost" onClick={onSkip} disabled={busy}>Skip</button>}
        <button type="button" className="ob-btn ob-btn--primary ob-foot-main" onClick={onContinue} disabled={busy || continueDisabled}>
          {busy ? <><span className="ob-btn-spin" aria-hidden="true" /> Working…</> : continueLabel}
        </button>
      </div>
    </footer>
  )
}
