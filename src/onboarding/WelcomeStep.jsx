import { Loading } from './parts'
import { STEP_TITLES } from './logic'

const MAX_SHOWN = 12

export default function WelcomeStep({ headingRef, name, industry, industries, onPick }) {
  const list = industries.status === 'ready' ? industries.data || [] : []
  // Keep the chosen one visible even if it is not among the most common.
  const shown = list.slice(0, MAX_SHOWN)
  const chosen = list.find((i) => i.value === industry)
  if (chosen && !shown.includes(chosen)) shown.push(chosen)

  return (
    <section aria-labelledby="ob-title">
      <h1 id="ob-title" ref={headingRef} tabIndex={-1}>{STEP_TITLES.welcome}{name ? `, ${name}` : ''}</h1>
      <p className="ob-lead">Let’s get your business ready. It takes about two minutes, you can skip anything, and you can come back to this any time from the menu.</p>

      <div className="ob-card ob-business">
        <span className="ob-business-label">Your business</span>
        <strong>{name || 'Your business'}</strong>
      </div>

      <fieldset className="ob-fieldset">
        <legend>What kind of business is it?</legend>
        <p className="ob-hint">We use this to suggest the right apps. You can change your mind on the next screen.</p>
        {industries.status === 'loading' && <Loading what="business types" />}
        {industries.status !== 'loading' && shown.length === 0 && (
          <p className="ob-hint">We could not load the list, so we will suggest our most popular apps.</p>
        )}
        <div className="ob-choices">
          {shown.map((item) => (
            <label key={item.value} className={`ob-choice${industry === item.value ? ' is-on' : ''}`}>
              <input
                type="radio"
                name="industry"
                value={item.value}
                checked={industry === item.value}
                onChange={() => onPick(item.value)}
              />
              <span className="ob-choice-icon" aria-hidden="true">{item.icon}</span>
              <span className="ob-choice-text">
                <b>{item.label}</b>
                {item.hint && <small>{item.hint}</small>}
              </span>
            </label>
          ))}
        </div>
      </fieldset>
    </section>
  )
}
