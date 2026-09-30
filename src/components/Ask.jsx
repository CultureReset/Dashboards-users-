import { useEffect, useRef, useState } from 'react'
import { answerFromCache, askTheBox } from '../lib/agent'

/**
 * Ask your own business a question, out loud.
 *
 * A sheet over the dashboard rather than a page, so asking something never
 * loses your place in what you were editing.
 *
 * It is handed `sections` — the same `tableRows` the dashboard is rendering,
 * not a separate read. If the answer came from a different source than the
 * screen, the two could disagree, and an owner who is told one price while
 * looking at another has no reason to trust either.
 *
 * Most questions never reach a model. Hours, prices, what's on tonight, how
 * many of something — those are lookups against data already on the device,
 * and they come back instantly, exactly, and cannot be invented. The model is
 * for the rest.
 */
export default function Ask({ sections, open, onClose, boxUrl, boxKey, model = 'v4' }) {
  const [question, setQuestion] = useState('')
  const [turns, setTurns] = useState([])     // { q, a, from, exact }
  const [busy, setBusy] = useState(false)
  const [listening, setListening] = useState(false)
  const [note, setNote] = useState('')
  const recognition = useRef(null)
  const inputRef = useRef(null)
  const endRef = useRef(null)

  useEffect(() => { if (open) inputRef.current?.focus() }, [open])
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [turns, busy])

  // Escape closes. A sheet you can't dismiss with the keyboard is a trap on
  // desktop, where this will be open next to what it's answering about.
  useEffect(() => {
    if (!open) return
    const onKey = (e) => { if (e.key === 'Escape') onClose?.() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  function listen() {
    if (listening) { recognition.current?.stop(); return }

    // Browsers only hand out a microphone on a secure origin, and "secure"
    // means https or literally localhost. Over plain http the mic fails with
    // a vague permission error that sends you hunting through browser
    // settings for a problem that isn't there. Say the real cause.
    if (!window.isSecureContext) {
      setNote('The microphone needs https. Typing still works.')
      return
    }

    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!Recognition) {
      setNote('This browser has no speech recognition. Chrome and Safari do.')
      return
    }

    const r = new Recognition()
    r.lang = navigator.language || 'en-US'
    r.interimResults = true
    r.continuous = false

    let settled = ''
    r.onresult = (e) => {
      let live = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript
        if (e.results[i].isFinal) settled += t
        else live += t
      }
      setQuestion((settled + live).trim())
    }
    r.onerror = (e) => {
      setNote(e.error === 'not-allowed'
        ? 'Microphone blocked. Allow it for this page and try again.'
        : `Speech stopped: ${e.error}`)
      setListening(false)
    }
    // Ask as soon as they stop speaking — an owner holding a phone in a
    // kitchen should not have to find a send button.
    r.onend = () => {
      setListening(false)
      const q = (settled || '').trim()
      if (q) submit(q)
    }

    recognition.current = r
    setNote('')
    try { r.start(); setListening(true) } catch { setListening(false) }
  }

  async function submit(text) {
    const q = (text ?? question).trim()
    if (!q || busy) return
    setQuestion('')
    setNote('')

    // Try the data on the device first. No model, no network, no wait.
    const quick = answerFromCache(q, sections)
    if (quick) {
      setTurns((t) => [...t, { q, ...quick }])
      return
    }

    if (!boxUrl) {
      setTurns((t) => [...t, {
        q,
        answer: "That one needs your box, and this device isn't connected to it yet.",
        from: 'none',
        exact: false,
      }])
      return
    }

    setBusy(true)
    try {
      const res = await askTheBox(q, sections, { baseUrl: boxUrl, key: boxKey, model })
      setTurns((t) => [...t, { q, ...res }])
    } catch (err) {
      setTurns((t) => [...t, {
        q,
        answer: `Couldn't reach your box: ${err.message}`,
        from: 'error',
        exact: false,
      }])
    } finally {
      setBusy(false)
    }
  }

  if (!open) return null

  return (
    <div className="ask-sheet" role="dialog" aria-label="Ask about your business">
      <header className="ask-head">
        <strong>Ask</strong>
        <button className="ask-close" onClick={onClose} aria-label="Close">✕</button>
      </header>

      <div className="ask-log">
        {turns.length === 0 && (
          <div className="ask-empty">
            <p>Ask about your own business.</p>
            <ul>
              <li>What are my hours on Sunday?</li>
              <li>How much is the grouper sandwich?</li>
              <li>What's on this week?</li>
            </ul>
            <p className="ask-hint">
              Most of these are answered from data already on this device — no
              model runs and nothing leaves the phone.
            </p>
          </div>
        )}

        {turns.map((t, i) => (
          <div key={i} className="ask-turn">
            <div className="ask-q">{t.q}</div>
            <div className="ask-a">{t.answer}</div>
            {/* Where an answer came from, always. A looked-up fact and a
                model's sentence are not the same kind of thing and should
                never look the same on screen. */}
            <div className={`ask-src ${t.exact ? 'exact' : ''}`}>
              {t.exact ? `from your ${t.from}` : t.from === 'model' ? 'from your box' : t.from}
            </div>
          </div>
        ))}

        {busy && <div className="ask-busy">Asking your box…</div>}
        <div ref={endRef} />
      </div>

      {note && <div className="ask-note">{note}</div>}

      <form
        className="ask-form"
        onSubmit={(e) => { e.preventDefault(); submit() }}
      >
        <button
          type="button"
          className={`ask-mic ${listening ? 'on' : ''}`}
          onClick={listen}
          aria-label={listening ? 'Stop listening' : 'Speak'}
        >
          {listening ? '◼' : '🎤'}
        </button>
        <input
          ref={inputRef}
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder={listening ? 'Listening…' : 'Ask about your business'}
          autoComplete="off"
        />
        <button type="submit" className="ask-send" disabled={!question.trim() || busy}>↑</button>
      </form>
    </div>
  )
}
