import { useCallback, useEffect, useState } from 'react'
import api from '../lib/apiClient'
import endpoints from '../lib/endpoints'

// "My Ghost": the business's own box, reached from anywhere through the relay.
//
// Nothing here talks to the box directly. Every command is queued at
// gcr-api-clean, the box pulls it over its own outbound link, serves it
// locally, and posts the answer back; this page polls for that answer. The
// data stays at the business; only the answer travels.

const POLL_MS = 1500
const POLL_FOR_MS = 60000

function since(iso) {
  if (!iso) return 'never'
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 90) return `${s}s ago`
  if (s < 5400) return `${Math.round(s / 60)} min ago`
  return `${Math.round(s / 3600)} h ago`
}

function online(node) {
  return node.last_seen_at && Date.now() - new Date(node.last_seen_at).getTime() < 3 * 60 * 1000
}

export default function Ghost() {
  const [nodes, setNodes] = useState(null)
  const [error, setError] = useState('')
  const [enrolled, setEnrolled] = useState(null) // { node, token } shown once
  const [selected, setSelected] = useState(null)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [log, setLog] = useState([]) // most recent first
  const [approvals, setApprovals] = useState([])

  const load = useCallback(async () => {
    try {
      const { nodes: list } = await api.get(endpoints.nodes.list())
      setNodes(list)
      setSelected((cur) => cur || list.find((n) => !n.revoked_at)?.id || null)
      setError('')
    } catch (err) {
      setError(err.status === 501 ? 'Ghost boxes are not set up on the server yet.' : err.message)
      setNodes([])
    }
  }, [])

  useEffect(() => {
    load()
    const timer = setInterval(load, 30000)
    return () => clearInterval(timer)
  }, [load])

  async function enrol() {
    setBusy(true)
    try {
      const result = await api.post(endpoints.nodes.enrol(), { name: 'Ghost' })
      setEnrolled(result)
      await load()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  /** Queue one request for the box and wait for its answer. */
  async function ask(method, path, body) {
    const { request } = await api.post(endpoints.nodes.request(selected), { method, path, body })
    const deadline = Date.now() + POLL_FOR_MS
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, POLL_MS))
      const { request: latest } = await api.get(endpoints.nodes.requestStatus(selected, request.id))
      if (latest.status === 'done' || latest.status === 'failed') return latest
    }
    throw new Error('The box did not answer in time. Is it on and linked?')
  }

  async function send(e) {
    e.preventDefault()
    if (!text.trim() || !selected) return
    setBusy(true)
    const asked = text.trim()
    setText('')
    try {
      const answer = await ask('POST', '/intent', { text: asked })
      setLog((l) => [{ at: new Date(), asked, answer }, ...l].slice(0, 20))
      refreshApprovals()
    } catch (err) {
      setLog((l) => [{ at: new Date(), asked, error: err.message }, ...l].slice(0, 20))
    } finally {
      setBusy(false)
    }
  }

  async function refreshApprovals() {
    if (!selected) return
    try {
      const answer = await ask('GET', '/approvals')
      setApprovals(Array.isArray(answer.response_body) ? answer.response_body : [])
    } catch {
      /* the box is away; the list simply stays as it was */
    }
  }

  const node = nodes?.find((n) => n.id === selected)

  return (
    <div className="panel ghost-page">
      <h2>My Ghost</h2>
      <p className="claim-sub">
        Your box at the business. Tell it what to do from anywhere; your data stays there.
      </p>

      {error && <p className="error">{error}</p>}

      {enrolled && (
        <div className="panel ghost-enrolled">
          <h3>Box enrolled: {enrolled.node.name}</h3>
          <p>
            Copy this token into <code>~/.config/ghost/ghost.env</code> on the box as
            <code> NEXTGENT_NODE_TOKEN</code>, then run <code>ghost install</code>. It is shown
            once and never again.
          </p>
          <pre className="ghost-token">{enrolled.token}</pre>
          <button onClick={() => setEnrolled(null)}>I saved it</button>
        </div>
      )}

      <div className="section-tools">
        {(nodes || []).map((n) => (
          <button
            key={n.id}
            className={n.id === selected ? 'primary' : ''}
            onClick={() => setSelected(n.id)}
            disabled={!!n.revoked_at}
          >
            {n.name} · {n.revoked_at ? 'revoked' : online(n) ? 'online' : `last seen ${since(n.last_seen_at)}`}
          </button>
        ))}
        <button onClick={enrol} disabled={busy}>+ Enrol a box</button>
      </div>

      {node && (
        <>
          <p className="claim-status">
            {node.name}: version {node.version || '—'} · {online(node) ? 'online' : 'offline'} ·
            core {node.health?.core || 'unknown'}
          </p>

          <form onSubmit={send} className="ghost-command">
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder='Try "open display settings" or "text +1555… running late"'
              disabled={busy || !online(node)}
            />
            <button className="primary" type="submit" disabled={busy || !text.trim() || !online(node)}>
              {busy ? 'Working…' : 'Send'}
            </button>
          </form>

          {approvals.length > 0 && (
            <div className="panel">
              <h3>Waiting on your YES</h3>
              <ul>
                {approvals.map((a) => (
                  <li key={a.approval_id}>
                    <strong>{a.code}</strong> — {a.summary} (expires {since(a.expires_at).replace(' ago', '')})
                  </li>
                ))}
              </ul>
              <p className="claim-sub">Reply YES or NO with the number from your phone.</p>
            </div>
          )}

          <ul className="ghost-log">
            {log.map((entry, i) => (
              <li key={i}>
                <div><strong>You:</strong> {entry.asked}</div>
                {entry.error ? (
                  <div className="error">{entry.error}</div>
                ) : (
                  <Answer answer={entry.answer} />
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}

function Answer({ answer }) {
  const body = answer.response_body || {}
  if (answer.response_status !== 200) {
    return <div className="error">Box replied {answer.response_status}: {body.error || JSON.stringify(body)}</div>
  }
  if (body.resolved === false) {
    const known = Object.values(body.known_phrases || {}).flat()
    return (
      <div>
        <div>The box did not understand that.</div>
        {known.length > 0 && <div className="claim-sub">It understands: {known.join(' · ')}</div>}
      </div>
    )
  }
  const status = body.action?.status
  const receipt = body.receipt
  return (
    <div>
      <div>{body.capability} → {status}{body.approval ? ` (reply YES ${body.approval.ref} on your phone)` : ''}</div>
      {receipt && <div className="claim-sub">Verified: {receipt.result}</div>}
      {body.error && <div className="error">{body.error}</div>}
    </div>
  )
}
