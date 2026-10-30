import { useEffect, useState } from 'react'
import { api } from '../lib/apiClient'
import { SongRequestGuestPopup } from '../apps/song-request'
import { MerchStoreGuestPopup } from '../apps/merch-store'

/**
 * Clean link-style public page for a slug.
 * Buttons come from installed modules; each app owns its popup.
 */
export default function PublicLinkPage({ slug: slugProp }) {
  const slug = slugProp || new URLSearchParams(location.search).get('slug') || ''
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [openApp, setOpenApp] = useState(null)

  useEffect(() => {
    if (!slug) return
    api.get(`/api/public/link-page/${encodeURIComponent(slug)}`)
      .then(setData)
      .catch((err) => setError(err.message))
  }, [slug])

  if (!slug) return <div className="auth-screen"><div className="auth-card"><p>Missing slug.</p></div></div>
  if (error) return <div className="auth-screen"><div className="auth-card"><p>{error}</p></div></div>
  if (!data) return <div className="auth-screen"><div className="auth-card"><p>Loading…</p></div></div>

  return (
    <div className="auth-screen" style={{ alignItems: 'stretch' }}>
      <div className="auth-card" style={{ width: 'min(420px, 100%)', margin: '24px auto', display: 'grid', gap: 12 }}>
        {data.hero_image_url ? (
          <img src={data.hero_image_url} alt="" style={{ width: '100%', borderRadius: 16, maxHeight: 180, objectFit: 'cover' }} />
        ) : null}
        <h1 style={{ margin: 0 }}>{data.name}</h1>
        <p className="claim-sub">Pick what you need</p>
        {(data.buttons || []).map((btn) => (
          <button
            key={btn.id}
            type="button"
            className="auth-primary"
            onClick={() => setOpenApp(btn.id)}
            style={{ display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'center' }}
          >
            <span aria-hidden>{btn.icon}</span> {btn.name}
          </button>
        ))}
        {!data.buttons?.length ? <p className="claim-sub">No guest apps installed yet.</p> : null}
      </div>

      <SongRequestGuestPopup
        slug={slug}
        open={openApp === 'song-request'}
        onClose={() => setOpenApp(null)}
      />
      <MerchStoreGuestPopup
        slug={slug}
        open={openApp === 'merch-store'}
        onClose={() => setOpenApp(null)}
      />
    </div>
  )
}
