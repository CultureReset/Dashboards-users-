import { useCallback, useEffect, useState } from 'react'
import {
  fetchPaymentAccount, startOnboarding, refreshPaymentAccount, stripeLoginLink, money,
} from '../lib/bookingApi'

/**
 * Stripe Connect, from the business's side.
 *
 * What this screen deliberately does NOT do is ask for a Stripe secret key.
 * The older integration in the API does, stores it encrypted, and charges
 * with it — which means one stolen encryption key is every business's Stripe
 * account. Here the owner goes to Stripe, Stripe collects the bank details
 * and the identity documents, and what comes back is an account id that is
 * useless to anyone without the platform's own key.
 *
 * So: no key field, no bank field, no document upload. A button and a
 * status.
 */
export default function BookingPayments({ onChanged }) {
  const [account, setAccount] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  // Connecting Stripe is what flips a business from "setting up" to "taking
  // bookings", so the page's readiness line is told every time this reloads.
  const load = useCallback(async () => {
    try {
      setAccount(await fetchPaymentAccount())
      setError('')
      if (onChanged) onChanged()
    } catch (err) {
      setError(err.message)
    }
  }, [onChanged])

  useEffect(() => { load() }, [load])

  // Stripe's onboarding opens in this tab and redirects back. Coming back to
  // the tab is the only signal we get that anything happened, so that is
  // when the account is re-read.
  useEffect(() => {
    const onFocus = () => { refreshPaymentAccount().then(load).catch(() => load()) }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [load])

  async function connect() {
    setBusy(true)
    setError('')
    try {
      const link = await startOnboarding({
        return_url: `${location.origin}${location.pathname}#bookings`,
        refresh_url: `${location.origin}${location.pathname}#bookings`,
      })
      location.href = link.url
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  async function openStripe() {
    setBusy(true)
    try {
      const link = await stripeLoginLink()
      window.open(link.url, '_blank', 'noopener')
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  if (!account) {
    return <div className="booking-loading"><div className="spinner" /></div>
  }

  if (!account.stripe_configured) {
    return (
      <div className="booking-panel">
        <div className="booking-notice">
          <h4>Card payments aren&apos;t switched on for this platform yet</h4>
          <p>
            Your trips still work — set a trip&apos;s deposit to &ldquo;nothing, they pay you on the
            day&rdquo; and customers can book without a card. Once card payments are enabled here,
            connecting takes about five minutes.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="booking-panel">
      {error && <p className="auth-error">{error}</p>}

      {!account.connected ? (
        <div className="booking-notice">
          <h4>Get paid for your bookings</h4>
          <p>
            Connect a Stripe account and card payments go straight into your own bank, on your own
            payout schedule. We never see your card details, your bank details or your documents —
            Stripe collects all of it directly.
          </p>
          <p className="booking-note">
            You&apos;ll need your business details and a bank account. It takes about five minutes.
          </p>
          <button type="button" className="booking-btn" disabled={busy} onClick={connect}>
            {busy ? 'Opening Stripe…' : 'Connect Stripe'}
          </button>
        </div>
      ) : !account.charges_enabled ? (
        <div className="booking-notice booking-notice-warn">
          <h4>Stripe needs a bit more from you</h4>
          <p>
            Your account is created but not finished, so payments are still on hold. Picking up
            where you left off takes a minute.
          </p>
          <Requirements requirements={account.requirements} />
          <button type="button" className="booking-btn" disabled={busy} onClick={connect}>
            {busy ? 'Opening Stripe…' : 'Finish setting up'}
          </button>
        </div>
      ) : (
        <>
          <div className="booking-notice booking-notice-good">
            <h4>You&apos;re taking payments</h4>
            <p>
              Money from bookings goes into your Stripe account and out to your bank on your payout
              schedule. {account.payouts_enabled
                ? 'Payouts are switched on.'
                : 'Payouts are still pending — Stripe usually clears this within a day or two.'}
            </p>
          </div>

          {account.balance && (
            <dl className="booking-facts booking-facts-wide">
              <div>
                <dt>Available</dt>
                <dd>{money(account.balance.available_cents / 100, account.currency)}</dd>
              </div>
              <div>
                <dt>On the way</dt>
                <dd>{money(account.balance.pending_cents / 100, account.currency)}</dd>
              </div>
            </dl>
          )}

          <div className="booking-btn-row">
            <button type="button" className="booking-btn" disabled={busy} onClick={openStripe}>
              Open my Stripe dashboard
            </button>
            <button
              type="button" className="booking-btn booking-btn-ghost" disabled={busy}
              onClick={() => refreshPaymentAccount().then(load)}
            >
              Refresh status
            </button>
          </div>

          {!account.livemode && (
            <p className="booking-note">
              This is a Stripe <strong>test</strong> account — bookings here won&apos;t move real
              money.
            </p>
          )}
        </>
      )}

      <p className="booking-foot">
        Account: {account.account_id || 'not created yet'} · charges{' '}
        {account.charges_enabled ? 'on' : 'off'} · payouts {account.payouts_enabled ? 'on' : 'off'}
      </p>
    </div>
  )
}

/**
 * What Stripe is still waiting for, in the order it cares about.
 *
 * Stripe's requirement keys are machine-readable and unreadable to a human
 * ('individual.verification.document'), so they get a plain-English line
 * where we know one and a tidied-up version of the key where we don't. The
 * fallback matters: Stripe adds requirement keys we have never seen, and an
 * unknown one must still say something.
 */
function Requirements({ requirements }) {
  const due = [
    ...(requirements?.currently_due || []),
    ...(requirements?.past_due || []),
  ]
  const unique = [...new Set(due)]
  if (!unique.length) return null

  return (
    <ul className="booking-requirements">
      {unique.slice(0, 8).map((key) => (
        <li key={key}>{REQUIREMENT_LABELS[key] || humanize(key)}</li>
      ))}
    </ul>
  )
}

const REQUIREMENT_LABELS = {
  'external_account': 'Your bank account',
  'individual.verification.document': 'A photo of your ID',
  'company.verification.document': 'A company document',
  'business_profile.url': 'Your website address',
  'business_profile.mcc': 'What kind of business you are',
  'individual.id_number': 'Your tax or ID number',
  'company.tax_id': 'Your business tax number',
  'tos_acceptance.date': "Accepting Stripe's terms",
}

function humanize(key) {
  return String(key)
    .split('.').pop()
    .replace(/[_-]+/g, ' ')
    .replace(/^\w/, (c) => c.toUpperCase())
}
