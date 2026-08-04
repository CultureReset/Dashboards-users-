import { useEffect, useState } from 'react'
import { useAuth } from '../lib/AuthContext'
import { searchEntities } from '../lib/gcrApi'
import TopBar from '../components/TopBar'

// Admin landing screen: search every business and open its dashboard.
//
// Search goes through gcr-api-clean rather than straight to PostgREST, so the
// picker keeps working once the open anon grants are revoked and it stays on
// the same is_active filtering the public site uses.
export default function BusinessPicker() {
  const { openBusiness } = useAuth()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    const t = setTimeout(async () => {
      try {
        const found = await searchEntities(query)
        if (cancelled) return
        setResults(found)
        setError('')
      } catch (err) {
        if (!cancelled) setError(err.message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }, 250)

    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [query])

  return (
    <div className="picker-screen">
      <TopBar businessName="All businesses" />

      <div className="picker-body">
        <input
          className="picker-search"
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search businesses…"
          autoFocus
        />

        {error && <p className="auth-error">{error}</p>}
        {loading && <p className="claim-status">Loading…</p>}

        <ul className="picker-list">
          {results.map((b) => (
            <li key={b.slug}>
              <button className="picker-item" onClick={() => openBusiness(b.slug)}>
                {b.hero_image_url ? (
                  <img src={b.hero_image_url} alt="" />
                ) : (
                  <span className="picker-thumb" />
                )}
                <span className="picker-info">
                  <strong>{b.name}</strong>
                  <small>
                    {[b.city, b.state].filter(Boolean).join(', ')}
                    {b.entity_type ? ` · ${b.entity_type}` : ''}
                  </small>
                </span>
                <span className="picker-go">›</span>
              </button>
            </li>
          ))}
          {!loading && !results.length && (
            <li className="claim-empty">No businesses match "{query}".</li>
          )}
        </ul>
      </div>
    </div>
  )
}
