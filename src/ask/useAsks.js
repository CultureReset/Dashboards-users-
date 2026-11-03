import { useCallback, useEffect, useRef, useState } from 'react'
import { chipFor, createAsk, newAskId, pollAsk, resolveAccess } from './askClient'
import {
  clearCompanyChoice, loadAsks, loadCompanyChoice, resumable, saveAsks, saveCompanyChoice, upsertAsk,
} from './askStore'

// The Ask box's state: whether asking is possible, the recent asks, and the
// polling that keeps them current. All network work is in askClient.js; this
// file only wires it to React.
//
//   slug          the business (asks are remembered per browser and per business)
//   businessName  from the dashboard's entity; goes into the issue text
//   viewingAs     an admin is looking at someone else's business: never ask
//
// access.state: loading | viewing-as | signed-out | not-configured | unreachable
//               | no-company | choose | ready
export default function useAsks({ slug, businessName, viewingAs }) {
  const [access, setAccess] = useState({ state: viewingAs ? 'viewing-as' : 'loading' })
  const [asks, setAsks] = useState(() => (viewingAs ? [] : loadAsks(slug)))
  const [note, setNote] = useState('')
  const pollers = useRef(new Map()) // ask id -> AbortController
  const generation = useRef(0)

  const patch = useCallback((id, changes) => {
    setAsks((list) => upsertAsk(list, { id, ...changes }))
  }, [])

  // ── can we ask? ──
  const refresh = useCallback(async () => {
    const mine = ++generation.current
    if (viewingAs) {
      setAccess({ state: 'viewing-as' })
      return
    }
    setAccess({ state: 'loading' })
    const result = await resolveAccess({ remembered: loadCompanyChoice(slug) })
    if (mine === generation.current) setAccess(result)
  }, [slug, viewingAs])

  useEffect(() => {
    refresh()
    return () => { generation.current++ }
  }, [refresh])

  // ── remember the list ──
  useEffect(() => {
    if (!viewingAs) saveAsks(slug, asks)
  }, [slug, asks, viewingAs])

  // ── keep every open ask current ──
  useEffect(() => {
    if (access.state !== 'ready') return
    for (const ask of resumable(asks)) {
      if (ask.stalled || pollers.current.has(ask.id)) continue
      const ctl = new AbortController()
      pollers.current.set(ask.id, ctl)
      pollAsk(ask.issueId, {
        signal: ctl.signal,
        immediate: Date.now() - ask.createdAt > 10_000, // reopened: look now
        onUpdate: (s) => patch(ask.id, { status: s.status, answer: s.answer, stalled: '' }),
      }).then((r) => {
        if (pollers.current.get(ask.id) === ctl) pollers.current.delete(ask.id)
        if (r.aborted) return
        const changes = { status: r.status || ask.status, answer: r.answer }
        if (r.timedOut) changes.stalled = 'timeout'
        if (r.error) {
          changes.stalled = 'unreachable'
          if (r.error.code === 'signed-out' || r.error.code === 'not-configured') {
            setAccess({ state: r.error.code, message: r.error.message })
          }
        }
        patch(ask.id, changes)
        if (r.final) setNote(`${ask.text.slice(0, 60)}: ${chipFor({ ...ask, ...changes, state: 'tracked' }).label}`)
      })
    }
  }, [access.state, asks, patch])

  useEffect(() => {
    const live = pollers.current
    return () => {
      for (const ctl of live.values()) ctl.abort()
      live.clear()
    }
  }, [])

  // ── asking ──
  const run = useCallback(async (id, text, retry) => {
    if (access.state !== 'ready') return { ok: false, code: 'not-ready' }
    try {
      const r = await createAsk(text, {
        companyId: access.company.id, businessName, askId: id, retry,
      })
      patch(id, {
        state: 'tracked', issueId: r.issueId, identifier: r.identifier, status: r.status,
        assigned: r.assigned, leadName: r.leadName, assignNote: r.assignNote, error: '', stalled: '',
      })
      setNote(`Sent. ${r.assigned ? 'Working on it.' : 'Not assigned to an agent yet.'}`)
      return { ok: true }
    } catch (err) {
      const code = err.code || 'failed'
      patch(id, {
        state: code === 'unconfirmed' ? 'unconfirmed' : 'failed',
        error: err.message || 'Could not send.',
      })
      if (code === 'signed-out' || code === 'not-configured') setAccess({ state: code, message: err.message })
      return { ok: false, code }
    }
  }, [access, businessName, patch])

  const send = useCallback((text) => {
    const body = String(text || '').trim()
    if (!body || access.state !== 'ready') return Promise.resolve({ ok: false, code: 'empty' })
    const id = newAskId()
    setAsks((list) => upsertAsk(list, {
      id, text: body, createdAt: Date.now(), companyId: access.company.id, state: 'sending',
      issueId: '', identifier: '', status: '', answer: '', assigned: true, leadName: '', assignNote: '', error: '', stalled: '',
    }))
    return run(id, body, false)
  }, [access, run])

  const retry = useCallback((id) => {
    const ask = asks.find((a) => a.id === id)
    if (!ask) return Promise.resolve({ ok: false })
    patch(id, { state: 'sending', error: '' })
    return run(id, ask.text, true)
  }, [asks, patch, run])

  const dismiss = useCallback((id) => {
    pollers.current.get(id)?.abort()
    pollers.current.delete(id)
    setAsks((list) => list.filter((a) => a.id !== id))
  }, [])

  const choose = useCallback((companyId) => {
    const company = access.companies?.find((c) => c.id === companyId)
    if (!company) return
    saveCompanyChoice(slug, companyId)
    setAccess({ state: 'ready', company, companies: access.companies })
  }, [slug, access])

  // Look again at an ask whose polling stopped (timeout, or Paperclip unreachable).
  const recheck = useCallback((id) => patch(id, { stalled: '' }), [patch])

  const changeCompany = useCallback(() => {
    clearCompanyChoice(slug)
    setAccess((a) => (a.companies?.length > 1 ? { state: 'choose', companies: a.companies } : a))
  }, [slug])

  return { access, asks, note, send, retry, recheck, dismiss, choose, changeCompany, refresh }
}
