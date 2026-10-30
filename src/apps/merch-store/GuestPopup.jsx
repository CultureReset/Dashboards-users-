import { useEffect, useState } from 'react'
import { merchStoreApi } from './api'

/** Guest popup for Merch Store. Owned by this app; swappable surface. */
export default function GuestPopup({ slug, open, onClose, surface = 'popup' }) {
  const [catalog, setCatalog] = useState(null)
  const [cart, setCart] = useState({}) // productId -> { qty, size }
  const [name, setName] = useState('')
  const [table, setTable] = useState('')
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open || !slug) return
    merchStoreApi.catalog(slug)
      .then(setCatalog)
      .catch((err) => setError(err.message))
  }, [open, slug])

  if (!open) return null

  function setItem(product, patch) {
    setCart((prev) => ({
      ...prev,
      [product.id]: { qty: 1, size: product.sizes?.[0] || '', ...(prev[product.id] || {}), ...patch },
    }))
  }

  async function checkout(e) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const items = Object.entries(cart)
        .filter(([, v]) => v.qty > 0)
        .map(([product_id, v]) => ({
          product_id,
          quantity: Number(v.qty) || 1,
          size: v.size || undefined,
        }))
      const res = await merchStoreApi.placeOrder(slug, {
        guest_name: name.trim(),
        guest_table: table.trim() || undefined,
        items,
      })
      setResult(res)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const shellStyle = surface === 'popup'
    ? { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', display: 'grid', placeItems: 'center', zIndex: 80, padding: 16 }
    : { padding: 16 }
  const cardStyle = {
    width: 'min(460px, 100%)', maxHeight: '90vh', overflow: 'auto',
    background: '#0b1220', color: '#f8fafc', borderRadius: 20, padding: 18,
    border: '1px solid rgba(255,255,255,.12)',
  }

  return (
    <div style={shellStyle} role="dialog" aria-modal={surface === 'popup'} onClick={surface === 'popup' ? onClose : undefined}>
      <div style={cardStyle} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <h2 style={{ margin: 0 }}>Shop</h2>
          {surface === 'popup' ? <button type="button" onClick={onClose}>Close</button> : null}
        </div>
        {error ? <p>{error}</p> : null}
        {!catalog && !error ? <p>Loading…</p> : null}

        {catalog && !result ? (
          <form onSubmit={checkout} style={{ display: 'grid', gap: 12, marginTop: 12 }}>
            {catalog.open === false ? <p>Store is closed right now.</p> : null}
            {(catalog.products || []).map((p) => {
              const line = cart[p.id] || { qty: 0, size: p.sizes?.[0] || '' }
              return (
                <div key={p.id} style={{ display: 'grid', gridTemplateColumns: '64px 1fr', gap: 10, alignItems: 'center' }}>
                  {p.photo_url
                    ? <img src={p.photo_url} alt="" width={64} height={64} style={{ objectFit: 'cover', borderRadius: 12 }} />
                    : <div style={{ width: 64, height: 64, borderRadius: 12, background: 'rgba(255,255,255,.08)' }} />}
                  <div>
                    <strong>{p.name}</strong>
                    <div>${p.price}</div>
                    {p.sizes?.length ? (
                      <select value={line.size} onChange={(e) => setItem(p, { size: e.target.value, qty: line.qty || 1 })}>
                        {p.sizes.map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                    ) : null}
                    <input
                      type="number"
                      min="0"
                      value={line.qty}
                      onChange={(e) => setItem(p, { qty: Number(e.target.value) || 0 })}
                      style={{ width: 72, marginLeft: 8 }}
                    />
                  </div>
                </div>
              )
            })}
            <label>
              Your name
              <input value={name} onChange={(e) => setName(e.target.value)} required />
            </label>
            <label>
              Table
              <input value={table} onChange={(e) => setTable(e.target.value)} />
            </label>
            <button type="submit" disabled={busy || catalog.open === false}>
              {busy ? 'Placing…' : 'Place order'}
            </button>
          </form>
        ) : null}

        {result ? (
          <div style={{ marginTop: 12, display: 'grid', gap: 8 }}>
            <p><strong>Order code:</strong> {result.ord_code}</p>
            <p>Pay <strong>${result.amount}</strong> and put <strong>{result.ord_code}</strong> in the note.</p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {result.payment?.cashapp_url ? <a href={result.payment.cashapp_url} target="_blank" rel="noreferrer">Pay with Cash App</a> : null}
              {result.payment?.venmo_url ? <a href={result.payment.venmo_url} target="_blank" rel="noreferrer">Pay with Venmo</a> : null}
            </div>
            <button type="button" onClick={onClose}>Done</button>
          </div>
        ) : null}
      </div>
    </div>
  )
}
