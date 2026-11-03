import { useCallback, useEffect, useRef, useState } from 'react'
import ActionsSection from './ActionsSection'
import PermissionsSummary from './PermissionsSummary'
import PublicLink from './PublicLink'
import ResourceSection from './ResourceSection'
import SettingsSection from './SettingsSection'
import { Loading, ProblemState } from './states'
import { classifyError, getSdkApp } from './api'
import { normalizeApp } from './validate'
import './sdkapp.css'

/**
 * Any App SDK app, drawn from what the API says about it — no per-app code.
 *
 *   appKey        the app's id (the Store item's `key`)
 *   manifest      optional: the manifest the Store row carried, used only for the
 *                 name and summary while the descriptor loads
 *   fallback      what to show when the API says this is not an SDK app (404 on
 *                 the descriptor): the dashboard passes the Store screen
 *   onOpenStore   "Open the Store" in the 403 / uninstalled states
 *   onChanged     called after something changed that the launcher may show
 *
 * It draws, in order: the public link, one section per resource (list + add /
 * edit / delete), the actions, the settings form and a plain-words summary of
 * what the app can do. Nothing is drawn that the descriptor does not declare.
 */
export default function SdkApp({ appKey, manifest = null, fallback = null, onOpenStore, onChanged }) {
  const [phase, setPhase] = useState({ status: 'loading', app: null, problem: null })
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine !== false))
  const seq = useRef(0)
  const adders = useRef(new Map())

  const load = useCallback(async () => {
    const mine = ++seq.current
    setPhase((p) => ({ ...p, status: p.app ? 'ready' : 'loading', problem: null }))
    try {
      const data = await getSdkApp(appKey)
      if (mine !== seq.current) return
      const app = normalizeApp(data)
      if (!app.installed) setPhase({ status: 'blocked', app, problem: { kind: 'not_installed' } })
      else setPhase({ status: 'ready', app, problem: null })
    } catch (err) {
      if (mine !== seq.current) return
      const c = classifyError(err)
      if (c.kind === 'not_found') { setPhase({ status: 'not-sdk', app: null, problem: c }); return }
      setPhase((p) => ({ status: 'blocked', app: p.app, problem: c }))
    }
  }, [appKey])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    const up = () => { setOnline(true) }
    const down = () => setOnline(false)
    window.addEventListener('online', up)
    window.addEventListener('offline', down)
    return () => { window.removeEventListener('online', up); window.removeEventListener('offline', down) }
  }, [])

  // Back online with the whole app unavailable because we were offline: try again by itself.
  useEffect(() => {
    if (online && phase.status === 'blocked' && phase.problem?.kind === 'offline') load()
  }, [online, phase.status, phase.problem, load])

  // The app was uninstalled (or switched off) while it was open.
  const onGone = useCallback(() => {
    setPhase((p) => ({ status: 'blocked', app: p.app, problem: { kind: 'not_installed' } }))
    onChanged?.()
  }, [onChanged])

  const registerAdd = useCallback((id, fn) => {
    adders.current.set(id, fn)
    return () => { if (adders.current.get(id) === fn) adders.current.delete(id) }
  }, [])
  const openAdd = useCallback((id) => adders.current.get(id)?.(), [])
  const scrollToResource = useCallback((id) => {
    const el = document.getElementById(`sa-resource-${id}`)
    el?.scrollIntoView?.({ block: 'start', behavior: 'smooth' })
    el?.querySelector('h2')?.focus({ preventScroll: true })
  }, [])

  const jumpTo = (id) => {
    const el = document.getElementById(id)
    el?.scrollIntoView?.({ block: 'start', behavior: 'smooth' })
    el?.querySelector('h2')?.focus({ preventScroll: true })
  }

  if (phase.status === 'not-sdk') return fallback || <ProblemState kind="server" message="This app has no screen of its own here yet." onOpenStore={onOpenStore} />

  if (phase.status === 'loading') {
    return (
      <div className="sdkapp">
        <Loading label={`Opening ${manifest?.name || 'the app'}`} />
      </div>
    )
  }

  if (phase.status === 'blocked' && !phase.app) {
    return (
      <div className="sdkapp">
        <ProblemState kind={phase.problem?.kind} name={manifest?.name} message={phase.problem?.message} onRetry={load} onOpenStore={onOpenStore} />
      </div>
    )
  }

  const app = phase.app
  const gone = phase.status === 'blocked'
  const places = [
    ...app.resources.map((r) => [`sa-resource-${r.id}`, r.label]),
    ...(app.settings.schema.length ? [['sa-settings', 'Settings']] : []),
    ...(app.actions.length ? [['sa-actions', 'Actions']] : []),
    ...(app.public ? [['sa-public', 'Public link']] : []),
    ['sa-permissions', 'What it can do'],
  ]
  const hasSomething = app.resources.length || app.actions.length || app.settings.schema.length || app.public

  return (
    <div className="sdkapp" data-app={app.id}>
      {!online && <p className="sa-offline" role="status">You're offline. You can look around, but nothing will save until you're back online.</p>}

      {gone && <ProblemState kind={phase.problem?.kind} name={app.name} message={phase.problem?.message} onRetry={load} onOpenStore={onOpenStore} />}

      {!gone && (
        <>
          <div className="sa-intro">
            {app.summary && <p className="sa-summary">{app.summary}</p>}
            {app.description && app.description !== app.summary && (
              <details className="sa-details"><summary>About this app</summary><p className="sa-muted">{app.description}</p></details>
            )}
            {!hasSomething && <p className="sa-muted">{app.name} has nothing for you to set up or manage here. It works in the background.</p>}
          </div>

          {places.length > 2 && (
            <ul className="sa-jump" aria-label="Jump to">
              {places.map(([id, label]) => (
                <li key={id}><button type="button" onClick={() => jumpTo(id)}>{label}</button></li>
              ))}
            </ul>
          )}

          {app.resources.map((r) => (
            <ResourceSection key={r.id} app={app} resource={r} registerAdd={registerAdd} onGone={onGone} />
          ))}

          {app.settings.schema.length > 0 && <SettingsSection app={app} onGone={onGone} onSaved={() => onChanged?.()} />}

          <ActionsSection app={app} onGone={onGone} openAdd={openAdd} scrollToResource={scrollToResource} />

          <PublicLink app={app} />

          <PermissionsSummary app={app} />
        </>
      )}
    </div>
  )
}
