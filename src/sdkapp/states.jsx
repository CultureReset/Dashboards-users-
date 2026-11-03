// The screens that are not the app: loading, and every way it can be unavailable.
// Each says what happened in the owner's words and what to do next.

export function Loading({ label = 'Loading' }) {
  return (
    <div className="sa-loading" role="status" aria-live="polite">
      <div className="spinner" aria-hidden="true" />
      <span>{label}&hellip;</span>
    </div>
  )
}

const COPY = {
  offline: {
    title: "You're offline",
    body: "We can't reach the server right now. Check your connection. Nothing you've done is lost.",
    action: 'Try again',
  },
  not_configured: {
    title: 'Not switched on yet',
    body: "This app needs a one-time setup on the platform before it can keep information. That isn't something you did, and your business and its data are fine. Please let the platform team know, then try again.",
    action: 'Try again',
  },
  forbidden: {
    title: "Not included in your plan",
    body: "Your account doesn't have access to this app right now. The Store shows what is available to you.",
    action: 'Open the Store',
  },
  not_installed: {
    title: 'This app was removed',
    body: 'It was uninstalled while you had it open. Your information is kept, and comes back if you install the app again.',
    action: 'Open the Store',
  },
  signed_out: {
    title: 'Please sign in again',
    body: 'Your session ended. Sign in to carry on where you left off.',
    action: null,
  },
  server: {
    title: 'Something went wrong',
    body: "We couldn't load this app. Please try again in a moment.",
    action: 'Try again',
  },
}

/**
 * @param {{ kind: string, name?: string, message?: string, onRetry?: () => void, onOpenStore?: () => void }} p
 */
export function ProblemState({ kind, name, message, onRetry, onOpenStore }) {
  const copy = COPY[kind] || COPY.server
  const toStore = copy.action === 'Open the Store'
  const handler = toStore ? onOpenStore : onRetry
  return (
    <section className="sa-problem" role="alert" data-kind={kind} aria-labelledby="sa-problem-title">
      <h2 id="sa-problem-title" className="sa-problem-title">{kind === 'not_installed' && name ? `${name} was removed` : copy.title}</h2>
      <p>{copy.body}</p>
      {kind === 'server' && message && <p className="sa-muted">The server said: {message}</p>}
      {copy.action && handler && (
        <button type="button" className="primary sa-btn" onClick={handler}>{copy.action}</button>
      )}
    </section>
  )
}

/** A small in-section version, for one list that failed while the rest of the app works. */
export function InlineProblem({ kind, message, onRetry }) {
  const copy = COPY[kind] || COPY.server
  return (
    <div className="sa-inline-problem" role="alert">
      <p><strong>{copy.title}.</strong> {kind === 'server' && message ? message : copy.body}</p>
      {onRetry && <button type="button" className="secondary sa-btn" onClick={onRetry}>Try again</button>}
    </div>
  )
}
