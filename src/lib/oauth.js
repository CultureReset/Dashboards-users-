// OAuth sign-in (Supabase Auth: Google / GitHub) through gcr-api-clean.
//
// PKCE verifier stays in this tab's sessionStorage; gcr-api-clean redirects to
// Supabase (GET /api/oauth/authorize) and later trades the returned ?code= for
// a session (POST /api/oauth/exchange). The session has the same shape as the
// password/phone ones, so authStore renews it via /api/business-auth/refresh.
// No Supabase URL or key is in this bundle.

import { GCR_API_BASE } from './config'
import { api } from './apiClient'

const VERIFIER_KEY = 'gcr_oauth_pkce_verifier'
const env = import.meta.env ?? {}

export const oauthProviders = String(env.VITE_OAUTH_PROVIDERS ?? 'google,github')
  .split(',').map((s) => s.trim()).filter(Boolean)

const b64url = (bytes) =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

export async function startOAuth(provider) {
  const verifier = b64url(crypto.getRandomValues(new Uint8Array(48)))
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))
  sessionStorage.setItem(VERIFIER_KEY, verifier)
  const qs = new URLSearchParams({
    provider,
    // The site root: this project has no SPA rewrite, so a /callback path would 404.
    redirect_to: `${location.origin}/`,
    code_challenge: b64url(new Uint8Array(digest)),
  })
  location.assign(`${GCR_API_BASE}/api/oauth/authorize?${qs}`)
}

/** True when this page load is the provider sending the browser back. */
export function isOAuthReturn() {
  const p = new URLSearchParams(location.search)
  return !!sessionStorage.getItem(VERIFIER_KEY) && (p.has('code') || p.has('error'))
}

export async function completeOAuth() {
  const p = new URLSearchParams(location.search)
  const verifier = sessionStorage.getItem(VERIFIER_KEY)
  sessionStorage.removeItem(VERIFIER_KEY)
  const code = p.get('code')
  const problem = p.get('error_description')
  const url = new URL(location.href)
  for (const k of ['code', 'error', 'error_code', 'error_description']) url.searchParams.delete(k)
  history.replaceState({}, '', url)
  if (problem) throw new Error(problem)
  if (!code || !verifier) throw new Error('That sign-in did not complete. Try again.')
  const out = await api.post('/api/oauth/exchange', { auth_code: code, code_verifier: verifier }, { auth: false })
  if (!out?.session?.access_token) throw new Error('The server did not return a session.')
  return out.session
}
