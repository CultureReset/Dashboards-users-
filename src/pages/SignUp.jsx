import { useEffect, useState } from 'react'
import {
  sendSignupCode,
  verifySignupCode,
  findSimilarBusinesses,
  registerBusiness,
} from '../lib/gcrApi'
import { useAuth } from '../lib/AuthContext'
import { INDUSTRIES } from '../lib/industries'

// Creating a brand-new business from scratch.
//
// Phone → six-digit code → business name → industry. Four steps, and the only
// one that can fail on the way in is the code.
//
// This is for businesses that are NOT already on GCR. A business that already
// has a listing goes through the invite link instead, because handing over an
// existing profile needs its identity checked first. If someone types a name
// that already exists, this screen says so and points them at the claim flow
// rather than letting them build a second copy of a real business.
//
// Nothing created here is public. The listing stays hidden until it is
// reviewed — the form says so rather than implying it went live.

const STEPS = ['phone', 'code', 'business', 'industry']

export default function SignUp({ onBack }) {
  const { signInWithPhone } = useAuth()
  const [step, setStep] = useState('phone')
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [website, setWebsite] = useState('')
  const [industry, setIndustry] = useState('')
  const [similar, setSimilar] = useState([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [alreadyListed, setAlreadyListed] = useState(null)

  // Warn about an existing listing while they type, not after they finish.
  useEffect(() => {
    if (step !== 'business') return
    const q = name.trim()
    if (q.length < 3) return setSimilar([])
    let cancelled = false
    const t = setTimeout(async () => {
      const matches = await findSimilarBusinesses(q)
      if (!cancelled) setSimilar(matches)
    }, 400)
    return () => { cancelled = true; clearTimeout(t) }
  }, [name, step])

  const go = (next) => { setError(''); setStep(next) }

  async function submitPhone(e) {
    e.preventDefault()
    setBusy(true); setError('')
    try {
      const sent = await sendSignupCode(phone)
      if (sent?.phone) setPhone(sent.phone)
      go('code')
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }

  async function submitCode(e) {
    e.preventDefault()
    setBusy(true); setError('')
    try {
      await verifySignupCode(phone, code)
      go('business')
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }

  function submitBusiness(e) {
    e.preventDefault()
    setError('')
    go('industry')
  }

  async function finish(chosen) {
    setBusy(true); setError(''); setAlreadyListed(null)
    try {
      const created = await registerBusiness({
        phone,
        code,
        business_name: name.trim(),
        website: website.trim() || undefined,
        entity_type: chosen || undefined,
      })
      // The account exists now. session_secret is a one-time value the server
      // just set on it; signing in with it here is what mints the browser
      // session. The business never sees it and never types a password.
      const { error: signInError } = await signInWithPhone(phone, created.session_secret, created.login_email)
      if (signInError) throw signInError
    } catch (err) {
      if (err.claim_instead) setAlreadyListed(err.claim_instead)
      setError(err.message)
      setBusy(false)
    }
  }

  const stepIndex = STEPS.indexOf(step)

  return (
    <div className="auth-screen">
      <div className={`auth-card${step === 'industry' ? ' setup-card' : ''}`}>
        <div className="signup-progress" aria-hidden="true">
          {STEPS.map((s, i) => (
            <span key={s} className={`signup-dot${i <= stepIndex ? ' done' : ''}`} />
          ))}
        </div>

        {step === 'phone' && (
          <form onSubmit={submitPhone}>
            <h1>Add your business</h1>
            <p className="claim-sub">
              We&apos;ll text you a six-digit code to confirm your number.
            </p>
            <label>
              Mobile number
              <input
                type="tel"
                value={phone}
                onChange={(e) => { setPhone(e.target.value); setError('') }}
                placeholder="(251) 555-0100"
                autoComplete="tel"
                required
                autoFocus
              />
            </label>
            {error && <p className="auth-error">{error}</p>}
            <button type="submit" disabled={busy}>{busy ? 'Sending…' : 'Send my code'}</button>
            <button type="button" className="auth-switch" onClick={onBack}>
              Already have a login? Sign in
            </button>
          </form>
        )}

        {step === 'code' && (
          <form onSubmit={submitCode}>
            <h1>Enter your code</h1>
            <p className="claim-sub">Sent to {phone}. It expires in a few minutes.</p>
            <label>
              Six-digit code
              <input
                className="code-input"
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                value={code}
                onChange={(e) => { setCode(e.target.value.replace(/\D/g, '')); setError('') }}
                autoComplete="one-time-code"
                required
                autoFocus
              />
            </label>
            {error && <p className="auth-error">{error}</p>}
            <button type="submit" disabled={busy || code.length < 6}>
              {busy ? 'Checking…' : 'Confirm'}
            </button>
            <button type="button" className="auth-switch" onClick={() => go('phone')}>
              Use a different number
            </button>
          </form>
        )}

        {step === 'business' && (
          <form onSubmit={submitBusiness}>
            <h1>About your business</h1>
            <p className="claim-sub">Just the basics — you can fill in the rest later.</p>

            <label>
              Business name
              <input
                type="text"
                value={name}
                onChange={(e) => { setName(e.target.value); setError('') }}
                required
                autoFocus
              />
            </label>

            {similar.length > 0 && (
              <div className="similar-warning">
                <strong>Already on Gulf Coast Radar?</strong>
                <p>
                  If one of these is you, claim it instead — you&apos;ll keep the
                  reviews and photos already there.
                </p>
                <ul>
                  {similar.slice(0, 4).map((m) => (
                    <li key={m.slug}>
                      {m.name}
                      {m.city ? <span> · {m.city}</span> : null}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <label>
              Website <span className="optional">optional</span>
              <input
                type="url"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                placeholder="https://"
                inputMode="url"
              />
            </label>

            {error && <p className="auth-error">{error}</p>}
            <button type="submit">Continue</button>
          </form>
        )}

        {step === 'industry' && (
          <>
            <h1>What kind of business?</h1>
            <p className="claim-sub">
              This decides what {name || 'your business'} gets set up with. You
              can change it later.
            </p>

            <div className="industry-grid">
              {INDUSTRIES.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  className={`industry-option${industry === item.value ? ' active' : ''}`}
                  onClick={() => setIndustry(item.value)}
                  disabled={busy}
                >
                  <span className="industry-icon">{item.icon}</span>
                  <span className="industry-label">{item.label}</span>
                  <span className="industry-hint">{item.hint}</span>
                </button>
              ))}
            </div>

            {alreadyListed && (
              <div className="similar-warning">
                <strong>{alreadyListed.name} is already listed.</strong>
                <p>
                  Claim that listing instead — that route checks you own it, and
                  you keep everything already on the profile.
                </p>
              </div>
            )}
            {error && <p className="auth-error">{error}</p>}

            <button
              type="button"
              className="primary setup-submit"
              onClick={() => finish(industry)}
              disabled={busy || !industry}
            >
              {busy ? 'Creating your account…' : 'Create my account'}
            </button>
            <button
              type="button"
              className="auth-switch"
              onClick={() => finish('')}
              disabled={busy}
            >
              Skip for now
            </button>
            <p className="claim-status signup-fineprint">
              Your listing stays hidden from the public site until we review it.
              You can start filling it in straight away.
            </p>
          </>
        )}
      </div>
    </div>
  )
}
