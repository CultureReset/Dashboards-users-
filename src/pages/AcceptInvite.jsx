import { useEffect, useState } from 'react'
import { readInvite, acceptInvite } from '../lib/gcrApi'
import { useAuth } from '../lib/AuthContext'
import { INDUSTRIES } from '../lib/industries'

// Setting up an invited business.
//
// Reached from the link an admin generates and sends. The token identifies the
// business, so this screen never asks which one — it says the name and gets on
// with the two things it actually needs: a password, and what kind of business
// this is.
//
// Everything here goes through gcr-api-clean, including the sign-in that
// follows. POST /api/auth/accept-invite creates the Auth account, writes the
// entity_owners row the dashboard reads access from, and sets entity_type;
// POST /api/business-auth/password then mints the session. Nothing in this
// browser holds a database credential.

export default function AcceptInvite({ token, onDone }) {
  const { signIn } = useAuth()
  const [invite, setInvite] = useState(null)
  const [loadError, setLoadError] = useState('')
  const [step, setStep] = useState('password') // 'password' | 'industry'
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [industry, setIndustry] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    readInvite(token)
      .then((data) => { if (!cancelled) setInvite(data) })
      .catch((err) => { if (!cancelled) setLoadError(err.message) })
    return () => { cancelled = true }
  }, [token])

  function toIndustry(e) {
    e.preventDefault()
    setError('')
    if (password.length < 8) return setError('Use at least 8 characters.')
    if (password !== confirm) return setError('Those passwords do not match.')
    setStep('industry')
  }

  async function finish(chosen) {
    setBusy(true)
    setError('')
    try {
      await acceptInvite({ token, password, entity_type: chosen || undefined })
      // The account exists now, so sign in with it and land in the dashboard.
      const { error: signInError } = await signIn(invite.email, password)
      if (signInError) throw signInError
      onDone?.()
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  if (loadError) {
    return (
      <div className="auth-screen">
        <div className="auth-card">
          <h1>That link doesn&apos;t work</h1>
          <p className="claim-sub">{loadError}</p>
          <p className="claim-status">
            Invite links last 14 days and can only be used once. Ask whoever
            sent it for a new one.
          </p>
        </div>
      </div>
    )
  }

  if (!invite) {
    return (
      <div className="dashboard-loading">
        <div className="spinner" />
        <span>Checking your link…</span>
      </div>
    )
  }

  if (step === 'industry') {
    return (
      <div className="auth-screen">
        <div className="auth-card setup-card">
          <h1>What kind of business?</h1>
          <p className="claim-sub">
            This decides what {invite.business_name} gets set up with. You can
            change it later.
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

          {error && <p className="auth-error">{error}</p>}

          <button
            type="button"
            className="primary setup-submit"
            onClick={() => finish(industry)}
            disabled={busy || !industry}
          >
            {busy ? 'Setting up…' : 'Finish setup'}
          </button>
          <button
            type="button"
            className="auth-switch"
            onClick={() => finish('')}
            disabled={busy}
          >
            Skip for now
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="auth-screen">
      <form className="auth-card" onSubmit={toIndustry}>
        <h1>Set up {invite.business_name}</h1>
        <p className="claim-sub">
          Choose a password and this listing is yours to manage.
        </p>
        <p className="claim-status">Signing in as {invite.email}</p>

        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => { setPassword(e.target.value); setError('') }}
            autoComplete="new-password"
            minLength={8}
            required
            autoFocus
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
      </form>
    </div>
  )
}
