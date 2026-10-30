import { useState } from 'react'
import { AuthProvider, useAuth } from './lib/AuthContext'
import Login from './pages/Login'
import Claim from './pages/Claim'
import Dashboard from './pages/Dashboard'
import BusinessPicker from './pages/BusinessPicker'
import AcceptInvite from './pages/AcceptInvite'
import SignUp from './pages/SignUp'
import ResetPassword from './pages/ResetPassword'

function NoBusinessLinked() {
  const { signOut, user } = useAuth()
  return (
    <div className="auth-screen">
      <div className="auth-card">
        <h1>No business linked</h1>
        <p className="claim-sub">
          This account isn't connected to a business yet.
        </p>
        <p className="claim-status">{user?.email}</p>
        <button type="button" className="auth-switch" onClick={signOut}>
          Sign out
        </button>
      </div>
    </div>
  )
}

function ImpersonationError() {
  const { impersonationError, exitImpersonation } = useAuth()
  return (
    <div className="auth-screen">
      <div className="auth-card">
        <h1>Admin link</h1>
        <p className="claim-sub">{impersonationError}</p>
        <button type="button" className="auth-switch" onClick={exitImpersonation}>
          Back to sign in
        </button>
      </div>
    </div>
  )
}

/** ?token=… means the visitor followed an invite link (root or /accept). */
function inviteTokenFromUrl() {
  return new URLSearchParams(location.search).get('token')
}


/** Recovery link from Supabase Auth: #access_token=…&type=recovery */
function recoveryAccessTokenFromUrl() {
  const hash = new URLSearchParams((location.hash || '').replace(/^#/, ''))
  if ((hash.get('type') || '').toLowerCase() !== 'recovery') return null
  return hash.get('access_token') || null
}

function Root() {
  const { loading, user, isAdmin, gcrSlug, impersonationError, viewingAsImpersonation } = useAuth()
  const [claiming, setClaiming] = useState(false)
  const [signingUp, setSigningUp] = useState(false)
  const [inviteToken, setInviteToken] = useState(inviteTokenFromUrl)
  const [recoveryToken, setRecoveryToken] = useState(recoveryAccessTokenFromUrl)

  if (recoveryToken) {
    return (
      <ResetPassword
        accessToken={recoveryToken}
        onDone={() => {
          const url = new URL(location.href)
          url.hash = ''
          history.replaceState({}, '', url)
          setRecoveryToken(null)
        }}
      />
    )
  }

  if (loading) {
    return (
      <div className="dashboard-loading">
        <div className="spinner" />
      </div>
    )
  }

  if (impersonationError && !user) {
    return <ImpersonationError />
  }

  // An invite beats everything else, including an existing session: someone
  // may open a link on a machine already signed in as another business.
  // Admin Open-dashboard passes are handled in AuthContext before this tree
  // renders a session; invite links still win for owner onboarding.
  if (inviteToken && !viewingAsImpersonation) {
    return (
      <AcceptInvite
        token={inviteToken}
        onDone={() => {
          // Drop the token so a refresh doesn't replay a now-used invite.
          const url = new URL(location.href)
          url.searchParams.delete('token')
          history.replaceState({}, '', url)
          setInviteToken(null)
        }}
      />
    )
  }

  if (!user) {
    if (signingUp) return <SignUp onBack={() => setSigningUp(false)} />
    return claiming ? (
      <Claim onBack={() => setClaiming(false)} />
    ) : (
      <Login onClaim={() => setClaiming(true)} onSignUp={() => setSigningUp(true)} />
    )
  }

  // Admin with no business selected picks one; deep links / impersonation land straight in.
  if (isAdmin && !gcrSlug) return <BusinessPicker />

  if (!gcrSlug) return <NoBusinessLinked />
  return <Dashboard />
}

export default function App() {
  return (
    <AuthProvider>
      <Root />
    </AuthProvider>
  )
}
