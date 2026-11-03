import { useRef, useState } from 'react'
import { Footer, Loading, Note, Problem, Switch } from './parts'
import { installApp } from './api'
import {
  STEP_TITLES, appsToInstall, asksForAccess, installMessage, pendingAccess, permissionWords, priceLabel, switchedOn,
} from './logic'
import { isInstallable } from './recommend'

export default function AppsStep({ headingRef, store, reloadStore, industry, manual, results, dispatch, nav }) {
  const [busy, setBusy] = useState(false)
  const lock = useRef(false) // blocks a second press before React re-renders

  const items = store.status === 'ready' ? store.data || [] : []
  const on = switchedOn(items, industry, manual)
  const todo = appsToInstall(items, on, results)
  const waiting = pendingAccess(results)
  const visible = items.filter((item) => isInstallable(item) || results[item.id])
  const already = items.filter((item) => item.installed && !results[item.id])

  async function install(item, accept = false) {
    dispatch({ type: 'result', id: item.id, result: { status: 'installing' } })
    try {
      await installApp(item.id, accept)
      dispatch({ type: 'result', id: item.id, result: { status: 'ok' } })
    } catch (err) {
      if (asksForAccess(err)) {
        dispatch({ type: 'result', id: item.id, result: { status: 'needs_access', permissions: err.body.permissions } })
      } else if (err?.status === 409) {
        // "Already installed": the end state they asked for.
        dispatch({ type: 'result', id: item.id, result: { status: 'ok', note: 'Already installed' } })
      } else {
        dispatch({ type: 'result', id: item.id, result: { status: 'failed', message: installMessage(err) } })
      }
    }
  }

  async function run(list, accept = false) {
    if (lock.current) return
    lock.current = true
    setBusy(true)
    try {
      for (const item of list) await install(item, accept)
      await reloadStore(true)
    } finally {
      lock.current = false
      setBusy(false)
    }
  }

  function declineAccess(item) {
    dispatch({ type: 'clearResult', id: item.id })
    dispatch({ type: 'toggle', id: item.id, value: false })
  }

  const onContinue = () => (todo.length ? run(todo) : nav.next())
  const label = todo.length ? `Install ${todo.length} and continue` : 'Continue'

  let body
  if (store.status === 'loading') body = <Loading what="your apps" />
  else if (store.status === 'unavailable') {
    body = <Note>The app store is not open for your business yet, so there is nothing to pick here. You can add apps later from Store.</Note>
  } else if (store.status === 'error') {
    body = <Problem message={store.error?.message} onRetry={() => reloadStore()} />
  } else if (visible.length === 0 && already.length === 0) {
    body = <Note>There are no apps to pick for your business right now. New ones show up in Store when they are ready.</Note>
  } else {
    body = (
      <>
        {visible.length > 0 && (
          <ul className="ob-apps" aria-label="Apps you can add">
            {visible.map((item) => (
              <AppCard
                key={item.id}
                item={item}
                checked={on.has(item.id) || results[item.id]?.status === 'ok'}
                result={results[item.id]}
                disabled={busy}
                onToggle={(value) => dispatch({ type: 'toggle', id: item.id, value })}
                onRetry={() => run([item])}
                onAllow={() => run([item], true)}
                onDecline={() => declineAccess(item)}
              />
            ))}
          </ul>
        )}
        {already.length > 0 && (
          <div className="ob-already">
            <h2>Already on your dashboard</h2>
            <ul>{already.map((item) => <li key={item.id}><span aria-hidden="true">{item.icon || '📦'}</span> {item.name}</li>)}</ul>
          </div>
        )}
      </>
    )
  }

  return (
    <>
      <section aria-labelledby="ob-title">
        <h1 id="ob-title" ref={headingRef} tabIndex={-1}>{STEP_TITLES.apps}</h1>
        <p className="ob-lead">Switch on what you want. We have turned on a few we think suit your business. Nothing is added until you press Continue.</p>
        {body}
      </section>
      <Footer
        busy={busy}
        onBack={nav.back}
        onSkip={nav.skip}
        onContinue={onContinue}
        canBack={nav.canBack}
        continueLabel={label}
        continueDisabled={waiting.length > 0}
        hint={waiting.length > 0 ? 'Choose Allow or Not now on the app that is asking for access.' : ''}
      />
    </>
  )
}

function AppCard({ item, checked, result, disabled, onToggle, onRetry, onAllow, onDecline }) {
  const status = result?.status
  const locked = status === 'ok' || status === 'installing' || status === 'needs_access'
  return (
    <li className={`ob-app${checked ? ' is-on' : ''}`}>
      <div className="ob-app-row">
        <span className="ob-app-icon" aria-hidden="true">{item.icon || '📦'}</span>
        <div className="ob-app-text">
          <b>{item.name}</b>
          <span className="ob-app-summary">{item.summary || 'Adds a new section to your dashboard.'}</span>
          <span className={`ob-tag${item.reason === 'free' ? ' ob-tag--free' : ''}`}>{priceLabel(item)}</span>
        </div>
        <Switch
          checked={checked}
          label={`${checked ? 'Installing' : 'Install'} ${item.name}`}
          disabled={disabled || locked}
          onChange={onToggle}
        />
      </div>

      {status === 'installing' && <p className="ob-result" role="status"><span className="ob-btn-spin" aria-hidden="true" /> Installing…</p>}
      {status === 'ok' && <p className="ob-result ob-result--ok" role="status">✓ {result.note || 'Installed'}</p>}
      {status === 'failed' && (
        <div className="ob-result ob-result--bad" role="alert">
          <span>{result.message}</span>
          <button type="button" className="ob-btn ob-btn--ghost" onClick={onRetry} disabled={disabled}>Try again</button>
        </div>
      )}
      {status === 'needs_access' && (
        <div className="ob-consent" role="group" aria-label={`${item.name} asks for access`}>
          <p><b>{item.name}</b> needs your OK to:</p>
          <ul>{result.permissions.map((code) => <li key={code}>{permissionWords(code)}</li>)}</ul>
          <div className="ob-consent-actions">
            <button type="button" className="ob-btn ob-btn--primary" onClick={onAllow} disabled={disabled}>Allow and install</button>
            <button type="button" className="ob-btn ob-btn--ghost" onClick={onDecline} disabled={disabled}>Not now</button>
          </div>
        </div>
      )}
    </li>
  )
}
