import { useEffect, useReducer, useRef } from 'react'
import { useAuth } from '../lib/AuthContext'
import { loadIndustries, loadStoreItems, loadTools } from '../onboarding/api'
import { useLoader } from '../onboarding/hooks'
import { STEPS, STEP_TITLES, canGoBack, initialState, reduce, stepIndex, summarize } from '../onboarding/logic'
import { saveProgress, saveState, loadProgress } from '../onboarding/storage'
import WelcomeStep from '../onboarding/WelcomeStep'
import AppsStep from '../onboarding/AppsStep'
import ToolsStep from '../onboarding/ToolsStep'
import DoneStep from '../onboarding/DoneStep'
import { Footer } from '../onboarding/parts'
import '../onboarding/onboarding.css'

// The guided setup: welcome, pick apps, connect tools, done.
//
// A full-screen flow that replaces the dashboard while it is open. It talks to
// the same endpoints the Store and Tools screens already use and decides
// nothing about what a business may have — the server does, from the session.
// Progress is remembered per business in this browser (see storage.js).
//
// onClose({ changed }) hands control back to the dashboard; `changed` says
// whether apps or tools were added, so it knows to refresh its menu.

export default function Onboarding({ entity, onClose }) {
  const { gcrSlug, businessName } = useAuth()
  const name = businessName || entity?.name || ''
  const headingRef = useRef(null)

  const [state, dispatch] = useReducer(reduce, undefined, () => {
    const start = initialState(loadProgress(gcrSlug))
    if (!start.industry && entity?.entity_type) start.industry = entity.entity_type
    return start
  })
  const [store, reloadStore] = useLoader(loadStoreItems)
  const [tools, reloadTools] = useLoader(loadTools)
  const [industries] = useLoader(loadIndustries)

  const unavailable = [
    store.status === 'unavailable' && 'apps',
    (tools.status === 'unavailable' || (tools.status === 'ready' && tools.data?.composio_configured === false)) && 'tools',
  ].filter(Boolean)

  // Remember where they are; a finished or closed setup keeps its own flags.
  useEffect(() => { saveState(gcrSlug, state) }, [gcrSlug, state])

  // Each step moves focus to its heading so a screen reader announces it.
  useEffect(() => { headingRef.current?.focus({ preventScroll: true }) }, [state.step])

  const connectedAtStart = useRef(null)
  const connectedNow = (tools.data?.tools || []).filter((t) => t.connection?.status === 'connected').length
  if (connectedAtStart.current === null && tools.status === 'ready') connectedAtStart.current = connectedNow
  const changed =
    Object.values(state.results).some((r) => r.status === 'ok' && !r.note) ||
    (connectedAtStart.current !== null && connectedNow > connectedAtStart.current)

  const nav = {
    next: () => dispatch({ type: 'next', unavailable }),
    back: () => dispatch({ type: 'back', unavailable }),
    skip: () => dispatch({ type: 'skip', unavailable }),
    canBack: canGoBack(state.step, unavailable),
  }

  const leave = (flags) => {
    saveProgress(gcrSlug, { ...flags, fresh: false })
    onClose({ changed })
  }
  const close = () => leave({ dismissed: true })
  const finish = () => leave({ dismissed: true, completed: true })

  const index = stepIndex(state.step)
  const summary = summarize({
    items: store.data,
    results: state.results,
    tools: tools.data?.tools,
    unavailable,
    skipped: state.skipped,
  })

  let content
  if (state.step === 'apps') {
    content = (
      <AppsStep
        headingRef={headingRef}
        store={store}
        reloadStore={reloadStore}
        industry={state.industry}
        manual={state.manual}
        results={state.results}
        dispatch={dispatch}
        nav={nav}
      />
    )
  } else if (state.step === 'tools') {
    content = <ToolsStep headingRef={headingRef} tools={tools} reloadTools={reloadTools} industry={state.industry} nav={nav} />
  } else if (state.step === 'done') {
    content = <DoneStep headingRef={headingRef} name={name} summary={summary} onFinish={finish} nav={nav} />
  } else {
    content = (
      <>
        <WelcomeStep
          headingRef={headingRef}
          name={name}
          industry={state.industry}
          industries={industries}
          onPick={(value) => dispatch({ type: 'industry', value })}
        />
        <Footer onBack={nav.back} onSkip={nav.skip} onContinue={nav.next} canBack={nav.canBack} />
      </>
    )
  }

  return (
    <div className="ob" role="dialog" aria-modal="true" aria-labelledby="ob-title">
      <header className="ob-top">
        <div className="ob-progress">
          <ol className="ob-dots" aria-label="Setup progress">
            {STEPS.map((step, i) => (
              <li
                key={step}
                className={`ob-dot${i < index ? ' is-done' : ''}${i === index ? ' is-current' : ''}`}
                aria-current={i === index ? 'step' : undefined}
              >
                <span className="ob-sr">{`Step ${i + 1} of ${STEPS.length}: ${STEP_TITLES[step]}${i < index ? ', finished' : ''}`}</span>
              </li>
            ))}
          </ol>
          <span className="ob-count" aria-hidden="true">Step {index + 1} of {STEPS.length}</span>
        </div>
        <button type="button" className="ob-close" onClick={close} aria-label="Close setup. Your progress is saved." title="Finish later">
          <span aria-hidden="true">✕</span>
        </button>
      </header>
      <main className="ob-main">
        <div className="ob-body">{content}</div>
      </main>
    </div>
  )
}
