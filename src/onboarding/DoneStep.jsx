import { Footer } from './parts'
import { STEP_TITLES } from './logic'

export default function DoneStep({ headingRef, name, summary, onFinish, nav }) {
  const { installed, connected, appsNote, toolsNote } = summary
  return (
    <>
      <section aria-labelledby="ob-title">
        <div className="ob-done-mark" aria-hidden="true">✓</div>
        <h1 id="ob-title" ref={headingRef} tabIndex={-1}>{STEP_TITLES.done}</h1>
        <p className="ob-lead">{name ? `${name} is ready.` : 'Your business is ready.'} Here is what you have so far. You can change any of it later.</p>

        <div className="ob-card">
          <h2>Apps</h2>
          {installed.length > 0 ? (
            <ul className="ob-summary">{installed.map((item) => <li key={item.id}><span aria-hidden="true">{item.icon || '📦'}</span> {item.name}</li>)}</ul>
          ) : (
            <p className="ob-hint">{appsNote || 'No apps added yet. Add them any time from Store.'}</p>
          )}
          {installed.length > 0 && appsNote && <p className="ob-hint">{appsNote}</p>}
        </div>

        <div className="ob-card">
          <h2>Connected tools</h2>
          {connected.length > 0 ? (
            <ul className="ob-summary">{connected.map((tool) => <li key={tool.tool_id}>✓ {tool.name}</li>)}</ul>
          ) : (
            <p className="ob-hint">{toolsNote || 'No tools connected yet. Connect them any time from Tools.'}</p>
          )}
        </div>

        <p className="ob-hint">Reopen this guide any time from the menu, under Setup.</p>
      </section>
      <Footer
        onBack={nav.back}
        onContinue={onFinish}
        canBack={nav.canBack}
        canSkip={false}
        continueLabel="Open my dashboard"
      />
    </>
  )
}
