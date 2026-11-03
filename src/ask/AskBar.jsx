import { useEffect, useId, useRef, useState } from 'react'
import { chipFor } from './askClient'
import useAsks from './useAsks'
import './ask.css'

// The Ask box: one text box on top of the app grid. The owner says what they
// want in plain words; it becomes an issue in their Paperclip company, assigned
// to the company's lead agent; the agent's last comment is the answer.
// See docs/ASK-BOX.md.
//
//   slug, businessName   the business (from the dashboard's entity)
//   viewingAs            an admin is "viewing as" this business: asking is off
//   prefill              { text, n } — a tile's "Ask about this" fills the box
//   onOpenView(view)     open an existing screen: 'platform' (sign-in), 'ghost'
//   canOpenGhost         the My Ghost screen is on this business's grid

const speechCtor = () => (typeof window === 'undefined' ? null : window.SpeechRecognition || window.webkitSpeechRecognition || null)

function ago(ts, now = Date.now()) {
  const s = Math.max(0, Math.round((now - ts) / 1000))
  if (s < 45) return 'just now'
  if (s < 3600) return `${Math.round(s / 60)} min ago`
  if (s < 86400) return `${Math.round(s / 3600)} h ago`
  return `${Math.round(s / 86400)} d ago`
}

function Panel({ tone = 'info', title, children, actions }) {
  return (
    <div className="ak-panel" data-tone={tone} role={tone === 'info' ? 'status' : 'alert'}>
      <p className="ak-panel-title">{title}</p>
      <div className="ak-panel-body">{children}</div>
      {actions ? <div className="ak-actions">{actions}</div> : null}
    </div>
  )
}

function AccessPanel({ ask, onOpenView }) {
  const { access, choose, refresh } = ask
  const [pick, setPick] = useState('')
  const again = <button type="button" className="ak-btn" onClick={refresh}>Check again</button>
  switch (access.state) {
    case 'loading':
      return <p className="ak-hint" role="status">Connecting to your business team…</p>
    case 'viewing-as':
      return (
        <Panel title="Asking is off while you view as this business">
          You are looking at this business as an admin. A question asked from here would land in your own Paperclip
          company, not theirs, so the box is switched off rather than guessing. Sign in as the owner to ask on their behalf.
        </Panel>
      )
    case 'signed-out':
      return (
        <Panel
          tone="attention"
          title="Sign in to Paperclip to ask"
          actions={<><button type="button" className="ak-btn ak-primary" onClick={() => onOpenView?.('platform')}>Open sign-in</button>{again}</>}
        >
          Your questions are answered by the AI team in Paperclip, which has its own sign-in. Sign in on the Platform
          screen, come back here, and choose Check again.
        </Panel>
      )
    case 'not-configured':
      return (
        <Panel
          tone="attention"
          title="Asking is not switched on for this site yet"
          actions={again}
        >
          The site does not know where Paperclip is: <code>PAPERCLIP_SERVER_URL</code> is not set. Whoever manages the
          deployment sets it (hosting project settings, Environment Variables) to the Paperclip server address and
          redeploys. Nothing is wrong with your account.
        </Panel>
      )
    case 'unreachable':
      return (
        <Panel tone="attention" title="Can't reach Paperclip right now" actions={again}>
          {access.message || 'The Paperclip server did not answer.'} Your question was not sent. Try again in a minute.
        </Panel>
      )
    case 'no-company':
      return (
        <Panel tone="attention" title="No company to ask yet" actions={again}>
          You are signed in to Paperclip, but your account has no business company yet. The platform owner needs to add
          you to your company; then choose Check again.
        </Panel>
      )
    case 'choose':
      return (
        <Panel
          title="Which company is this?"
          actions={<button type="button" className="ak-btn ak-primary" disabled={!pick} onClick={() => choose(pick)}>Use this one</button>}
        >
          Your Paperclip account can reach more than one company. Pick the one for this business; this device will
          remember it.
          <label className="ak-field">
            <span className="ak-sr">Company</span>
            <select value={pick} onChange={(e) => setPick(e.target.value)}>
              <option value="">Choose a company</option>
              {access.companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
        </Panel>
      )
    default:
      return null
  }
}

function AskItem({ item, open, onToggle, ask, canOpenGhost, onOpenView }) {
  const chip = chipFor(item)
  const body = item.answer
  const blocked = item.status === 'blocked'
  const showLink = blocked || item.status === 'in_review'
  return (
    <li className="ak-item" data-tone={chip.tone}>
      <div className="ak-item-head">
        <button type="button" className="ak-item-toggle" aria-expanded={open} onClick={onToggle}>
          <span className="ak-q">{item.text}</span>
          <span className="ak-meta">
            {[item.identifier, ago(item.createdAt)].filter(Boolean).join(' · ')}
            {chip.detail ? ` · ${chip.detail}` : ''}
          </span>
        </button>
        <span className="ak-chip" data-tone={chip.tone} role="status" aria-live="polite">{chip.label}</span>
      </div>
      {body && !open ? <p className="ak-preview">{body}</p> : null}
      {open && (
        <div className="ak-detail">
          {body ? (
            <p className="ak-answer">{body}</p>
          ) : (
            <p className="ak-muted">
              {item.state === 'tracked' && ['done', 'in_review', 'blocked', 'cancelled'].includes(item.status)
                ? `The agent set this to "${item.status.replace('_', ' ')}" without leaving an answer.`
                : item.state === 'tracked' ? 'No answer yet. It appears here as soon as the agent writes one.' : null}
            </p>
          )}
          {item.assignNote ? <p className="ak-note">{item.assignNote}</p> : null}
          {item.error ? <p className="ak-note" role="alert">{item.error}</p> : null}
          {showLink && (
            <p className="ak-note">
              Paperclip status: <strong>{item.status.replace('_', ' ')}</strong>.{' '}
              {blocked ? 'The agent needs something from you or an approval before it can go on.' : 'It is waiting for a review.'}
              {canOpenGhost && <> <button type="button" className="ak-link" onClick={() => onOpenView?.('ghost')}>Open My Ghost for approvals</button></>}
            </p>
          )}
          {item.stalled === 'timeout' && (
            <p className="ak-note">This is taking longer than ten minutes. We stopped checking for now and will look again the next time you open the app.</p>
          )}
          {item.stalled === 'unreachable' && (
            <p className="ak-note">We could not reach Paperclip to check on this.</p>
          )}
          <div className="ak-actions">
            {item.state === 'unconfirmed' || item.state === 'failed' ? (
              <button type="button" className="ak-btn" onClick={() => ask.retry(item.id)}>
                {item.state === 'unconfirmed' ? 'Check and send if needed' : 'Try again'}
              </button>
            ) : null}
            {item.stalled ? <button type="button" className="ak-btn" onClick={() => ask.recheck(item.id)}>Check now</button> : null}
            <button type="button" className="ak-btn ak-quiet" onClick={() => ask.dismiss(item.id)}>Remove from this list</button>
          </div>
        </div>
      )}
    </li>
  )
}

export default function AskBar({ slug, businessName, viewingAs = false, prefill, onOpenView, canOpenGhost = false }) {
  const ask = useAsks({ slug, businessName, viewingAs })
  const { access, asks } = ask
  const [text, setText] = useState('')
  const [open, setOpen] = useState(() => new Set())
  const [listening, setListening] = useState(false)
  const [voiceNote, setVoiceNote] = useState('')
  const inputRef = useRef(null)
  const recRef = useRef(null)
  const inputId = useId()
  const canAsk = access.state === 'ready'
  const Speech = speechCtor()

  // A tile's "Ask about this".
  useEffect(() => {
    if (!prefill?.n) return
    setText(prefill.text)
    inputRef.current?.focus({ preventScroll: false })
  }, [prefill])

  useEffect(() => () => recRef.current?.abort?.(), [])

  const submit = async (e) => {
    e.preventDefault()
    const body = text.trim()
    if (!body || !canAsk) return
    setText('')
    const r = await ask.send(body)
    if (!r.ok && r.code !== 'not-ready') setText((t) => t || body) // keep their words if it could not go
  }

  const toggleVoice = () => {
    if (!Speech) return
    if (listening) {
      recRef.current?.stop?.()
      return
    }
    try {
      const rec = new Speech()
      rec.lang = document.documentElement.lang || 'en-US'
      rec.interimResults = false
      rec.maxAlternatives = 1
      rec.onresult = (ev) => {
        const heard = Array.from(ev.results).map((r) => r[0]?.transcript || '').join(' ').trim()
        if (heard) setText((t) => (t ? `${t} ${heard}` : heard))
      }
      rec.onerror = (ev) => setVoiceNote(ev.error === 'not-allowed' ? 'Microphone access is blocked. You can type instead.' : 'Voice did not work. You can type instead.')
      rec.onend = () => setListening(false)
      recRef.current = rec
      setVoiceNote('')
      setListening(true)
      rec.start()
    } catch {
      setListening(false)
      setVoiceNote('Voice did not work. You can type instead.')
    }
  }

  const toggleOpen = (id) => setOpen((s) => {
    const next = new Set(s)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  })

  return (
    <section className="ak" aria-label="Ask your business">
      <form className="ak-form" onSubmit={submit}>
        <label className="ak-sr" htmlFor={inputId}>Ask anything about your business</label>
        <input
          id={inputId}
          ref={inputRef}
          className="ak-input"
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Ask anything about your business"
          enterKeyHint="send"
          autoComplete="off"
          maxLength={2000}
          disabled={!canAsk}
        />
        {Speech && (
          <button
            type="button"
            className="ak-mic"
            aria-pressed={listening}
            aria-label={listening ? 'Stop listening' : 'Speak your question'}
            onClick={toggleVoice}
            disabled={!canAsk}
          >
            <span aria-hidden="true">{listening ? '■' : '🎤'}</span>
          </button>
        )}
        <button type="submit" className="ak-send" aria-label="Send question" disabled={!canAsk || !text.trim()}>
          <span aria-hidden="true">↑</span>
        </button>
      </form>
      {voiceNote ? <p className="ak-hint" role="status">{voiceNote}</p> : null}

      <AccessPanel ask={ask} onOpenView={onOpenView} />

      {canAsk && (
        <p className="ak-hint">
          {text.trim() ? null : <>Try “update my hours”, “reply to my newest review” or “add a special for Friday”. </>}
          {access.companies?.length > 1 && (
            <>Asking <strong>{access.company.name}</strong>. <button type="button" className="ak-link" onClick={ask.changeCompany}>Change</button></>
          )}
        </p>
      )}

      {asks.length > 0 && access.state !== 'viewing-as' && (
        <div className="ak-recent">
          <h2 className="ak-recent-title">Recent asks</h2>
          <ul className="ak-list" aria-label="Recent asks">
            {asks.map((item) => (
              <AskItem
                key={item.id}
                item={item}
                open={open.has(item.id)}
                onToggle={() => toggleOpen(item.id)}
                ask={ask}
                canOpenGhost={canOpenGhost}
                onOpenView={onOpenView}
              />
            ))}
          </ul>
        </div>
      )}
      <p className="ak-sr" role="status" aria-live="polite">{ask.note}</p>
    </section>
  )
}
