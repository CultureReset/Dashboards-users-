import { useEffect, useRef, useState } from 'react'
import { Footer, Loading, Note, Problem } from './parts'
import { connectTool, refreshTool } from './api'
import { STEP_TITLES, classifyError } from './logic'
import { pickTools } from './recommend'

const isConnected = (tool) => tool.connection?.status === 'connected'

export default function ToolsStep({ headingRef, tools, reloadTools, industry, nav }) {
  // Per tool: { phase: 'opening' | 'waiting' | 'error', url?, message? }
  const [local, setLocal] = useState({})
  const lock = useRef(new Set())

  const all = tools.status === 'ready' ? tools.data?.tools || [] : []
  const shown = pickTools(all, industry)
  const waitingIds = Object.keys(local).filter((id) => local[id].phase === 'waiting')
  const waitingKey = waitingIds.join('|')

  // The provider's page opens in another tab and never comes back here, so the
  // tab regaining focus is the signal to ask the server how it went — the same
  // cue AppStore.jsx uses.
  useEffect(() => {
    if (!waitingKey) return undefined
    const onFocus = () => reconcile(waitingKey.split('|'))
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [waitingKey])

  async function reconcile(ids) {
    for (const id of ids) {
      try { await refreshTool(id) } catch { /* leave it waiting; they can check again */ }
    }
    await reloadTools(true)
  }

  async function connect(tool) {
    const id = tool.tool_id
    if (lock.current.has(id)) return
    lock.current.add(id)
    setLocal((s) => ({ ...s, [id]: { phase: 'opening' } }))
    try {
      const { redirect_url: url, status } = await connectTool(id)
      if (url) {
        window.open(url, '_blank', 'noopener')
        setLocal((s) => ({ ...s, [id]: { phase: 'waiting', url } }))
      } else {
        setLocal((s) => { const next = { ...s }; delete next[id]; return next })
        if (status === 'connected') await reloadTools(true)
      }
    } catch (err) {
      const { message } = classifyError(err)
      const text = err?.status === 501 ? 'Connecting is not switched on yet.' : err?.hint ? `${message} ${err.hint}` : message
      setLocal((s) => ({ ...s, [id]: { phase: 'error', message: text } }))
    } finally {
      lock.current.delete(id)
    }
  }

  async function checkAgain(id) {
    setLocal((s) => ({ ...s, [id]: { ...s[id], checking: true } }))
    await reconcile([id])
    setLocal((s) => (s[id] ? { ...s, [id]: { ...s[id], checking: false } } : s))
  }

  const notReady = tools.status === 'ready' && tools.data?.composio_configured === false
  let body
  if (tools.status === 'loading') body = <Loading what="tools" />
  else if (tools.status === 'unavailable' || notReady) {
    body = <Note>Connecting tools is not switched on yet, so you can skip this step. You can connect tools later from Tools.</Note>
  } else if (tools.status === 'error') body = <Problem message={tools.error?.message} onRetry={() => reloadTools()} />
  else if (shown.length === 0) body = <Note>No tools are available to connect right now. You can check again later from Tools.</Note>
  else {
    body = (
      <ul className="ob-tools" aria-label="Tools you can connect">
        {shown.map((tool) => (
          <ToolRow
            key={tool.tool_id}
            tool={tool}
            state={local[tool.tool_id]}
            onConnect={() => connect(tool)}
            onCheck={() => checkAgain(tool.tool_id)}
          />
        ))}
      </ul>
    )
  }

  return (
    <>
      <section aria-labelledby="ob-title">
        <h1 id="ob-title" ref={headingRef} tabIndex={-1}>{STEP_TITLES.tools}</h1>
        <p className="ob-lead">Optional. Connect the accounts you already use. Each one opens the provider’s own sign-in page in a new tab; we never see your password.</p>
        {body}
      </section>
      <Footer onBack={nav.back} onSkip={nav.skip} onContinue={nav.next} canBack={nav.canBack} />
    </>
  )
}

function Logo({ tool }) {
  const [failed, setFailed] = useState(false)
  if (tool.logo && !failed) {
    return <img className="ob-logo" src={tool.logo} alt="" width="40" height="40" onError={() => setFailed(true)} />
  }
  return <span className="ob-logo ob-logo--mono" aria-hidden="true">{(tool.name || '?').trim().charAt(0).toUpperCase()}</span>
}

function ToolRow({ tool, state, onConnect, onCheck }) {
  const connected = isConnected(tool)
  return (
    <li className="ob-tool">
      <div className="ob-tool-row">
        <Logo tool={tool} />
        <div className="ob-tool-text">
          <b>{tool.name}</b>
          <span className="ob-app-summary">{tool.description || `Connect ${tool.name} to your dashboard.`}</span>
        </div>
        {connected ? (
          <span className="ob-connected" role="status">✓ Connected</span>
        ) : (
          <button
            type="button"
            className="ob-btn ob-btn--primary ob-tool-btn"
            onClick={onConnect}
            disabled={state?.phase === 'opening' || state?.phase === 'waiting'}
            aria-label={`Connect ${tool.name}`}
          >
            {state?.phase === 'opening' ? 'Opening…' : 'Connect'}
          </button>
        )}
      </div>
      {!connected && state?.phase === 'waiting' && (
        <div className="ob-result" role="status">
          <span>Finish signing in on the tab that just opened, then come back here.</span>
          <span className="ob-result-links">
            <a href={state.url} target="_blank" rel="noopener noreferrer">Tab did not open? Open it here</a>
            <button type="button" className="ob-btn ob-btn--ghost" onClick={onCheck} disabled={state.checking}>
              {state.checking ? 'Checking…' : 'I have finished'}
            </button>
          </span>
        </div>
      )}
      {!connected && state?.phase === 'error' && (
        <div className="ob-result ob-result--bad" role="alert">
          <span>{state.message}</span>
          <button type="button" className="ob-btn ob-btn--ghost" onClick={onConnect}>Try again</button>
        </div>
      )}
    </li>
  )
}
