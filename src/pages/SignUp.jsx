import { useEffect, useState } from 'react'
import {
  findSimilarBusinesses,
  businessSignup,
} from '../lib/gcrApi'
import { useAuth } from '../lib/AuthContext'
import { INDUSTRIES } from '../lib/industries'

// Creating a brand-new business from scratch.
//
// Email + password → business name → industry. Phone OTP was removed; this
// reuses POST /api/auth/business-signup (entity + Auth user + entity_owners)
// then signs in via the existing password path.
//
// This is for businesses that are NOT already on GCR. A business that already
// has a listing goes through the invite link or claim flow instead. If someone
// types a name that already exists, this screen says so and points them at
// claim rather than letting them build a second copy.
//
// Nothing created here is public. The listing stays hidden until it is
// reviewed — the form says so rather than implying it went live.

const STEPS = ['account', 'business', 'industry']

export default function SignUp({ onBack }) {
  const { signIn } = useAuth()
  const [step, setStep] = useState('account')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
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

  function submitAccount(e) {
    e.preventDefault()
    setError('')
    const addr = email.trim().toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(addr)) {
      return setError('Enter a valid email address.')
    }
    if (password.length < 8) return setError('Use at least 8 characters.')
    if (password !== confirm) return setError('Those passwords do not match.')
    go('business')
  }

  function submitBusiness(e) {
    e.preventDefault()
    setError('')
    go('industry')
  }

  async function finish(chosen) {
    setBusy(true); setError(''); setAlreadyListed(null)
    try {
      await businessSignup({
        email: email.trim().toLowerCase(),
        password,
        business_name: name.trim(),
        website: website.trim() || undefined,
        entity_type: chosen || undefined,
      })
      // Account exists now — same pattern as AcceptInvite: sign in with the
      // password just chosen via POST /api/business-auth/password.
      const { error: signInError } = await signIn(email.trim().toLowerCase(), password)
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

        {step === 'account' && (
          <form onSubmit={submitAccount}>
            <h1>Add your business</h1>
            <p className="claim-sub">
              Choose an email and password — that is how you will sign in.
            </p>
            <label>
              Email
              <input
                type="email"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setError('') }}
                placeholder="you@business.com"
                autoComplete="email"
                required
                autoFocus
              />
            </label>
            <label>
              Password
              <input
                type="password"
                value={password}
                onChange={(e) => { setPassword(e.target.value); setError('') }}
                autoComplete="new-password"
                minLength={8}
                required
              />
            </label>
            <label>
              Confirm password
              <input
                type="password"
                value={confirm}
                onChange={(e) => { setConfirm(e.target.value); setError('') }}
                autoComplete="new-password"
                required
              />
            </label>
            {error && <p className="auth-error">{error}</p>}
            <button type="submit">Continue</button>
            <button type="button" className="auth-switch" onClick={onBack}>
              Already have a login? Sign in
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
            <button type="button" className="auth-switch" onClick={() => go('account')}>
              Back
            </button>
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
