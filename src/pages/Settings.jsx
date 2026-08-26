import { useEffect, useState } from 'react'
import { fetchProfile, saveProfile, saveHours, PROFILE_FIELDS, DAYS } from '../lib/profile'

// The business's own details, and the hours it is open.
//
// Two independent saves rather than one. Hours go to a different endpoint with
// different semantics — it replaces whole days — and rolling both into a
// single button would mean one half succeeding while the other failed with
// nothing to tell the owner which.
//
// The form holds a draft and compares it to what was loaded, so a save sends
// only what actually changed. That matters here: PUT /api/user/profile updates
// every field it is given, and resending unchanged values would overwrite work
// somebody else did between the load and the save.

const GROUPS = [
  {
    title: 'The basics',
    fields: [
      ['name', 'Business name'],
      ['subtitle', 'Tagline'],
      ['description', 'About', 'textarea'],
      ['price_range', 'Price range', 'text', '$$'],
    ],
  },
  {
    title: 'How people reach you',
    fields: [
      ['phone', 'Phone', 'tel'],
      ['email', 'Email', 'email'],
      ['website_url', 'Website', 'url'],
    ],
  },
  {
    title: 'Where you are',
    fields: [
      ['address_line_1', 'Street'],
      ['city', 'City'],
      ['state', 'State'],
      ['zip', 'ZIP'],
    ],
  },
  {
    title: 'Booking and ordering',
    fields: [
      ['booking_url', 'Booking link', 'url'],
      ['reservation_url', 'Reservation link', 'url'],
      ['order_url', 'Order link', 'url'],
    ],
  },
  {
    title: 'Social',
    fields: [
      ['social_instagram', 'Instagram'],
      ['social_facebook', 'Facebook'],
      ['social_tiktok', 'TikTok'],
    ],
  },
  {
    title: 'Images',
    fields: [['hero_image_url', 'Header image URL', 'url']],
  },
]

export default function Settings() {
  const [loaded, setLoaded] = useState(null)   // what the server last gave us
  const [draft, setDraft] = useState({})
  const [hours, setHours] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState('')
  const [saving, setSaving] = useState('')

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    try {
      const data = await fetchProfile()
      setLoaded(data.entity || {})
      setDraft(pick(data.entity || {}))
      setHours(sevenDays(data.hours || []))
      setError('')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const changed = PROFILE_FIELDS.filter((f) => (draft[f] ?? '') !== (loaded?.[f] ?? ''))

  async function submitProfile(event) {
    event.preventDefault()
    if (!changed.length) return
    setSaving('profile'); setSaved(''); setError('')
    try {
      const entity = await saveProfile(Object.fromEntries(changed.map((f) => [f, draft[f]])))
      setLoaded(entity)
      setDraft(pick(entity))
      setSaved(`Saved ${changed.length} ${changed.length === 1 ? 'change' : 'changes'}.`)
    } catch (err) {
      setError(err.message)
    } finally { setSaving('') }
  }

  async function submitHours(event) {
    event.preventDefault()
    setSaving('hours'); setSaved(''); setError('')
    try {
      setHours(sevenDays(await saveHours(hours)))
      setSaved('Hours saved.')
    } catch (err) {
      setError(err.message)
    } finally { setSaving('') }
  }

  function setDay(index, patch) {
    setHours((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)))
  }

  if (loading) return <div className="settings-loading">Loading your details…</div>

  // A 403 here is the legacy-account case, and no form will fix it.
  if (error && !loaded) {
    return (
      <div className="settings">
        <h2>Settings</h2>
        <div className="settings-error" role="alert">{error}</div>
        <button className="btn" onClick={load}>Try again</button>
      </div>
    )
  }

  return (
    <div className="settings">
      <header className="settings-head">
        <h2>Settings</h2>
        <p>What people see about you, everywhere you are listed.</p>
      </header>

      {error && <div className="settings-error" role="alert">{error}</div>}
      {saved && <div className="settings-saved" role="status">{saved}</div>}

      <form className="settings-form" onSubmit={submitProfile}>
        {GROUPS.map((group) => (
          <fieldset key={group.title} className="settings-group">
            <legend>{group.title}</legend>
            {group.fields.map(([field, label, type, placeholder]) => (
              <Field
                key={field}
                label={label}
                type={type}
                placeholder={placeholder}
                dirty={changed.includes(field)}
                value={draft[field] ?? ''}
                onChange={(value) => setDraft((d) => ({ ...d, [field]: value }))}
              />
            ))}
          </fieldset>
        ))}

        <div className="settings-actions">
          <button className="btn btn--primary" type="submit" disabled={!changed.length || saving === 'profile'}>
            {saving === 'profile' ? 'Saving…' : changed.length ? `Save ${changed.length}` : 'Nothing to save'}
          </button>
          {changed.length > 0 && (
            <button className="btn btn--quiet" type="button" onClick={() => setDraft(pick(loaded))}>
              Undo
            </button>
          )}
        </div>
      </form>

      <form className="settings-form settings-hours" onSubmit={submitHours}>
        <fieldset className="settings-group">
          <legend>Opening hours</legend>
          {hours.map((row, index) => (
            <div className="hours-edit" key={row.day_of_week}>
              <span className="hours-edit-day">{DAYS[row.day_of_week]}</span>
              <label className="hours-edit-closed">
                <input
                  type="checkbox"
                  checked={!!row.is_closed}
                  onChange={(e) => setDay(index, { is_closed: e.target.checked })}
                />
                Closed
              </label>
              <input
                type="time"
                value={row.opens_at || ''}
                disabled={!!row.is_closed}
                onChange={(e) => setDay(index, { opens_at: e.target.value })}
              />
              <span className="hours-edit-to">to</span>
              <input
                type="time"
                value={row.closes_at || ''}
                disabled={!!row.is_closed}
                onChange={(e) => setDay(index, { closes_at: e.target.value })}
              />
            </div>
          ))}
        </fieldset>
        <div className="settings-actions">
          <button className="btn btn--primary" type="submit" disabled={saving === 'hours'}>
            {saving === 'hours' ? 'Saving…' : 'Save hours'}
          </button>
        </div>
        <p className="settings-note">
          A day with two stretches — lunch and dinner — is stored as two rows. This form edits the
          first stretch of each day; the second stays as it is.
        </p>
      </form>
    </div>
  )
}

function Field({ label, type = 'text', placeholder, value, dirty, onChange }) {
  return (
    <label className={`settings-field${dirty ? ' settings-field--dirty' : ''}`}>
      <span>{label}</span>
      {type === 'textarea' ? (
        <textarea rows={4} value={value} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <input type={type} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
      )}
    </label>
  )
}

/** Only the fields the API will accept, so the draft cannot carry junk. */
function pick(entity) {
  const out = {}
  for (const field of PROFILE_FIELDS) out[field] = entity?.[field] ?? ''
  return out
}

/**
 * Seven rows, whatever the database has.
 *
 * A business that has never set hours has no rows at all, and a form with
 * nothing in it gives an owner nowhere to start. Days that do exist keep their
 * id so the save replaces them rather than adding duplicates.
 */
function sevenDays(rows) {
  return DAYS.map((_, day) => {
    const existing = rows.find((row) => Number(row.day_of_week) === day)
    return existing || { day_of_week: day, opens_at: '', closes_at: '', is_closed: false }
  })
}
