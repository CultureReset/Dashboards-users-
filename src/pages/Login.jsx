import { useState } from 'react'
import { useAuth } from '../lib/AuthContext'
import { sendSigninCode, verifySigninCode } from '../lib/gcrApi'

// Two ways in, because there are two kinds of account.
//
//   phone     businesses that signed themselves up. No password exists — the
//             number is the login and a texted code proves it.
//   password  businesses provisioned or invited, who were given a login.
//
// Phone is the default because it is the one that needs nothing remembered.

export default function Login({ onClaim, onSignUp }) {
  const { signIn, signInWithPhone } = useAuth()
  const [mode, setMode] = useState('phone') // 'phone' | 'password'
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [codeSent, setCodeSent] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      const { error } = await signIn(identifier, password)
      if (error) throw error
    } catch (err) {
      setError(
        /invalid login/i.test(err.message)
          ? 'That business name or password is not right.'
          : err.message
      )
    } finally {
      setBusy(false)
    }
  }

  async function requestCode(e) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      // Echo back the number the server normalised, so the confirmation reads
      // "+12515550100" rather than whatever shape they typed.
      const sent = await sendSigninCode(phone)
      if (sent?.phone) setPhone(sent.phone)
      setCodeSent(true)
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }

  async function submitCode(e) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      // The server checks the code and mints the session itself, so what comes
      // back is the finished thing rather than a secret to redeem. Nothing is
      // typed by the owner, and no credential reaches this browser at all.
      const { session } = await verifySigninCode(phone, code)
      const { error: signInError } = await signInWithPhone(phone, session)
      if (signInError) throw signInError
    } catch (err) { setError(err.message); setBusy(false) }
  }

  if (mode === 'phone') {
    return (
      <div className="auth-screen">
        <form className="auth-card" onSubmit={codeSent ? submitCode : requestCode}>
          <h1>Sign in</h1>
          {codeSent ? (
            <>
              <p className="claim-sub">We texted a code to {phone}.</p>
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
                {busy ? 'Checking…' : 'Sign in'}
              </button>
              <button
                type="button"
                className="auth-switch"
                onClick={() => { setCodeSent(false); setCode(''); setError('') }}
              >
                Use a different number
              </button>
            </>
          ) : (
            <>
              <p className="claim-sub">Enter your number and we&apos;ll text you a code.</p>
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
              <button type="submit" disabled={busy}>{busy ? 'Sending…' : 'Text me a code'}</button>
              <button type="button" className="auth-switch" onClick={() => { setMode('password'); setError('') }}>
                Given a business login instead? Use that
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
            </>
          )}
        </form>
      </div>
    )
  }

  return (
    <div className="auth-screen">
      <form className="auth-card" onSubmit={handleSubmit}>
        <h1>Sign in</h1>
        <p className="claim-sub">Use the business login you were given.</p>
        <label>
          Business login
          <input
            type="text"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            placeholder="your-business-name"
            autoCapitalize="none"
            autoCorrect="off"
            required
          />
        </label>
        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>
        {error && <p className="auth-error">{error}</p>}
        <button type="submit" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
        <button type="button" className="auth-switch" onClick={() => { setMode('phone'); setError('') }}>
          Sign in with your phone number instead
        </button>
      </form>
    </div>
  )
}
