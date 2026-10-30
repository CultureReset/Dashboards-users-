import { useState } from 'react'
import { useAuth } from '../lib/AuthContext'
import { forgotPassword } from '../lib/gcrApi'

// Email + password only. Phone OTP sign-in was removed from the UI; the API
// phone routes remain for any older clients. Invite accounts and self-signup
// accounts both use the same password path (POST /api/business-auth/password).

export default function Login({ onClaim, onSignUp }) {
  const { signIn } = useAuth()
  const [view, setView] = useState('signin') // 'signin' | 'forgot' | 'forgot-sent'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      const { error: signInError } = await signIn(email.trim(), password)
      if (signInError) throw signInError
    } catch (err) {
      setError(
        /invalid login|did not work/i.test(err.message)
          ? 'That email or password is not right.'
          : err.message
      )
    } finally {
      setBusy(false)
    }
  }

  async function handleForgot(e) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      await forgotPassword(email.trim().toLowerCase())
      setView('forgot-sent')
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  if (view === 'forgot-sent') {
    return (
      <div className="auth-screen">
        <div className="auth-card">
          <h1>Check your email</h1>
          <p className="claim-sub">
            If an account exists for {email.trim().toLowerCase()}, a reset link
            is on its way. The link opens this dashboard so you can choose a new
            password.
          </p>
          <button type="button" className="auth-switch" onClick={() => { setView('signin'); setError('') }}>
            ← Back to sign in
          </button>
        </div>
      </div>
    )
  }

  if (view === 'forgot') {
    return (
      <div className="auth-screen">
        <form className="auth-card" onSubmit={handleForgot}>
          <h1>Forgot password</h1>
          <p className="claim-sub">
            Enter the email on your business account and we&apos;ll send a reset
            link.
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
          {error && <p className="auth-error">{error}</p>}
          <button type="submit" disabled={busy}>
            {busy ? 'Sending…' : 'Send reset link'}
          </button>
          <button type="button" className="auth-switch" onClick={() => { setView('signin'); setError('') }}>
            ← Back to sign in
          </button>
        </form>
      </div>
    )
  }

  return (
    <div className="auth-screen">
      <form className="auth-card" onSubmit={handleSubmit}>
        <h1>Sign in</h1>
        <p className="claim-sub">Use the email and password for your business account.</p>
        <label>
          Email
          <input
            type="email"
            value={email}
            onChange={(e) => { setEmail(e.target.value); setError('') }}
            placeholder="you@business.com"
            autoCapitalize="none"
            autoCorrect="off"
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
            autoComplete="current-password"
            required
          />
        </label>
        {error && <p className="auth-error">{error}</p>}
        <button type="submit" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
        <button
          type="button"
          className="auth-switch"
          onClick={() => { setView('forgot'); setError(''); setPassword('') }}
        >
          Forgot password?
        </button>
        {onClaim && (
          <button type="button" className="auth-switch" onClick={onClaim}>
            Already on Gulf Coast Radar? Claim your business
          </button>
        )}
        {onSignUp && (
          <button type="button" className="auth-switch" onClick={onSignUp}>
            New business? Add it in a couple of minutes
          </button>
        )}
      </form>
    </div>
  )
}
