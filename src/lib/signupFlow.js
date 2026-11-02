// Registration and session creation are separate API operations. Once the
// account exists, a retry must only sign in, never register it a second time.
export async function finishBusinessSignup({ accountCreated, payload, register, signIn, onCreated }) {
  if (!accountCreated) {
    await register(payload)
    onCreated()
  }
  const { error } = await signIn(payload.email, payload.password)
  if (error) throw error
}
