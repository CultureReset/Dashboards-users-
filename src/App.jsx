import { useState } from 'react'
import { AuthProvider, useAuth } from './lib/AuthContext'
import Login from './pages/Login'
import Claim from './pages/Claim'
import Dashboard from './pages/Dashboard'
import BusinessPicker from './pages/BusinessPicker'
import AcceptInvite from './pages/AcceptInvite'
import SignUp from './pages/SignUp'

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

/** ?token=… means the visitor followed an invite link. */
function inviteTokenFromUrl() {
  return new URLSearchParams(location.search).get('token')
}

function Root() {
  const { loading, user, isAdmin, gcrSlug } = useAuth()
  const [claiming, setClaiming] = useState(false)
  const [signingUp, setSigningUp] = useState(false)
  const [inviteToken, setInviteToken] = useState(inviteTokenFromUrl)

  if (loading) {
    return (
      <div className="dashboard-loading">
        <div className="spinner" />
      </div>
    )
  }

  // An invite beats everything else, including an existing session: someone
  // may open a link on a machine already signed in as another business.
  if (inviteToken) {
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

  // Admin with no business selected picks one; deep links land straight in.
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
