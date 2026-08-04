import { useState } from 'react'
import { useAuth } from '../lib/AuthContext'

export default function Login({ onClaim, onSignUp }) {
  const { signIn } = useAuth()
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
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
        {/* Two different situations, deliberately worded so people pick the
            right one. Claim is for a business already on GCR — it keeps the
            reviews and photos already there. Sign up is for one that isn't
            listed at all. */}
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
