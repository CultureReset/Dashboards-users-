import { useState } from 'react'
import { resetPassword } from '../lib/gcrApi'

/**
 * Landed from the Supabase Auth recovery email.
 *
 * The link redirects here with `#access_token=…&type=recovery` (and usually a
 * refresh_token). We never talk to Supabase from the browser — the access
 * token is posted to gcr-api-clean, which verifies it and sets the password.
 */
export default function ResetPassword({ accessToken, onDone }) {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)

  async function submit(e) {
    e.preventDefault()
    setError('')
    if (password.length < 8) return setError('Use at least 8 characters.')
    if (password !== confirm) return setError('Those passwords do not match.')
    setBusy(true)
    try {
      await resetPassword({ access_token: accessToken, password })
      setDone(true)
    } catch (err) {
      setError(err.message || 'Could not reset that password.')
      setBusy(false)
    }
  }

  if (done) {
    return (
      <div className="auth-screen">
        <div className="auth-card">
          <h1>Password updated</h1>
          <p className="claim-sub">You can sign in with your email and new password.</p>
          <button type="button" onClick={onDone}>Sign in</button>
        </div>
      </div>
    )
  }

  return (
    <div className="auth-screen">
      <form className="auth-card" onSubmit={submit}>
        <h1>Choose a new password</h1>
        <p className="claim-sub">This replaces the old one on your business account.</p>
        <label>
          New password
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
        <button type="submit" disabled={busy}>
          {busy ? 'Saving…' : 'Save password'}
        </button>
      </form>
    </div>
  )
}
