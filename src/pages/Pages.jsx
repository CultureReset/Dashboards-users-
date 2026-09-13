import { useEffect, useState } from 'react'
import { api } from '../lib/apiClient'
import { endpoints } from '../lib/endpoints'

// The business's own pages — Facebook, Instagram, TikTok, website.
//
// ── Why this one screen is hand-written ─────────────────────────────────
//
// Every other section in this dashboard builds itself. Discovery finds the
// tables carrying an entity_slug, and a section appears for each one that has
// rows; nothing lists them and adding a table to the database is enough to
// make it editable here.
//
// These four are not rows in a table. They are columns on the `entity` record
// itself, whose key is `slug` rather than `entity_slug` — so discovery does
// not classify it as a business table, and it never appears. That is the
// correct behaviour and worth keeping: `entity` also holds is_active,
// listed_on_gcr and the slug, none of which a business may set for itself.
//
// So the exception is made here instead, and made narrow. Four named fields
// against one endpoint that accepts exactly those four. Nothing here grows
// when a column is added to `entity`, which is what makes it safe for this
// screen to reach a table the rest of the dashboard deliberately cannot.
//
// ── What the links are for ──────────────────────────────────────────────
//
// Storing them, so the platform knows where a business already is. Saving a
// Facebook page here does not publish anything and does not change the
// business's public profile on its own — it records the address. What reads it
// afterwards is a separate concern from this form.

const FIELDS = [
  {
    name: 'social_facebook',
    label: 'Facebook page',
    placeholder: 'https://facebook.com/yourbusiness',
    hint: 'The page itself, not a post — open your page and copy the address bar.',
  },
  {
    name: 'social_instagram',
    label: 'Instagram',
    placeholder: 'https://instagram.com/yourbusiness',
  },
  {
    name: 'social_tiktok',
    label: 'TikTok',
    placeholder: 'https://tiktok.com/@yourbusiness',
  },
  {
    name: 'website_url',
    label: 'Website',
    placeholder: 'https://yourbusiness.com',
  },
]

/**
 * Accept what someone actually pastes.
 *
 * People paste `facebook.com/x`, or the whole thing with tracking junk on the
 * end, or their @handle. Rejecting those teaches them the form is fussy; the
 * useful behaviour is to take it and tidy it. Only a value that cannot be read
 * as a web address at all is refused.
 */
function tidy(value, field) {
  const raw = (value || '').trim()
  if (!raw) return ''

  // A bare @handle or a plain username, for the two that have one.
  if (/^@?[\w.]+$/.test(raw) && !raw.includes('.com') && field.name !== 'website_url') {
    const handle = raw.replace(/^@/, '')
    if (field.name === 'social_instagram') return `https://instagram.com/${handle}`
    if (field.name === 'social_tiktok') return `https://tiktok.com/@${handle}`
  }

  const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`
  try {
    const url = new URL(withScheme)
    // Tracking parameters travel with every copied link and mean nothing here.
    //
    // The spread is load-bearing, whatever the linter says about it: deleting
    // from a URLSearchParams while iterating its own keys() shifts the
    // remaining entries and skips every second match, so `?fbclid&utm_source&
    // utm_medium` comes back still carrying utm_source. Iterate a snapshot.
    for (const key of [...url.searchParams.keys()]) {
      if (/^(fbclid|utm_|igshid|mibextid|si)/i.test(key)) url.searchParams.delete(key)
    }
    return url.toString().replace(/\/$/, '')
  } catch {
    return raw
  }
}

export default function Pages() {
  const [values, setValues] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    let cancelled = false
    api
      .get(endpoints.business.profile())
      .then((data) => {
        if (cancelled) return
        const seed = {}
        for (const f of FIELDS) seed[f.name] = data?.[f.name] || ''
        setValues(seed)
      })
      .catch((err) => {
        if (!cancelled) setError(err.message)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  function change(name, value) {
    setSaved(false)
    setValues((v) => ({ ...v, [name]: value }))
  }

  async function submit(e) {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      const body = {}
      for (const f of FIELDS) body[f.name] = tidy(values[f.name], f)
      const fresh = await api.patch(endpoints.business.profile(), body)
      const next = {}
      for (const f of FIELDS) next[f.name] = fresh?.[f.name] || ''
      setValues(next)
      setSaved(true)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="dashboard-loading">
        <div className="spinner" />
        <span>Loading your pages…</span>
      </div>
    )
  }

  if (!values) {
    return <p className="auth-error">Couldn't load your pages: {error}</p>
  }

  return (
    <form className="editor" onSubmit={submit}>
      <p className="industry-hint">
        Where your business already is online. Paste the address of each one —
        leave a box empty if you don't have it.
      </p>

      {FIELDS.map((field) => (
        <label key={field.name} className="editor-field">
          <span>{field.label}</span>
          <input
            type="text"
            inputMode="url"
            autoComplete="off"
            spellCheck="false"
            placeholder={field.placeholder}
            value={values[field.name]}
            onChange={(e) => change(field.name, e.target.value)}
          />
          {field.hint && <small className="industry-hint">{field.hint}</small>}
        </label>
      ))}

      {error && <p className="auth-error">{error}</p>}

      <div className="editor-actions">
        <button type="submit" className="primary" disabled={saving}>
          {saving ? 'Saving…' : 'Save'}
        </button>
        {saved && !saving && <span className="claim-status">Saved</span>}
      </div>
    </form>
  )
}
