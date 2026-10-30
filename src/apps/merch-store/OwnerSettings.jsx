import { useCallback, useEffect, useState } from 'react'
import { merchStoreApi } from './api'

/** Owner products, orders, and payment handles for Merch Store. */
export default function OwnerSettings({ slug }) {
  const [settings, setSettings] = useState(null)
  const [products, setProducts] = useState([])
  const [orders, setOrders] = useState([])
  const [draft, setDraft] = useState({ name: '', price: '', photo_url: '', sizes: '', stock_qty: '' })
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    if (!slug) return
    try {
      const [s, p, o] = await Promise.all([
        merchStoreApi.settings(slug),
        merchStoreApi.products(slug),
        merchStoreApi.orders(slug),
      ])
      setSettings(s)
      setProducts(p || [])
      setOrders(o || [])
      setError('')
    } catch (err) {
      setError(err.message)
    }
  }, [slug])

  useEffect(() => { load() }, [load])

  async function saveSettings(e) {
    e.preventDefault()
    setSaving(true)
    try {
      const next = await merchStoreApi.saveSettings(slug, {
        store_open: !!settings.store_open,
        cashapp_handle: settings.cashapp_handle || '',
        venmo_handle: settings.venmo_handle || '',
      })
      setSettings((prev) => ({ ...prev, ...next }))
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function addProduct(e) {
    e.preventDefault()
    if (!draft.name.trim()) return
    setSaving(true)
    try {
      await merchStoreApi.createProduct(slug, {
        name: draft.name.trim(),
        price: draft.price === '' ? null : Number(draft.price),
        photo_url: draft.photo_url.trim() || null,
        stock_qty: draft.stock_qty === '' ? null : Number(draft.stock_qty),
        sizes: draft.sizes.split(',').map((s) => s.trim()).filter(Boolean),
        active: true,
      })
      setDraft({ name: '', price: '', photo_url: '', sizes: '', stock_qty: '' })
      await load()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function toggleActive(product) {
    try {
      await merchStoreApi.updateProduct(slug, product.id, { active: product.active === false })
      await load()
    } catch (err) {
      setError(err.message)
    }
  }

  async function setOrderStatus(id, status) {
    try {
      await merchStoreApi.updateOrder(slug, id, { status })
      await load()
    } catch (err) {
      setError(err.message)
    }
  }

  if (!settings) return <div className="panel">{error || 'Loading merch store…'}</div>

  return (
    <div className="panel merch-store-owner">
      <h2>Merch Store</h2>
      {error ? <p className="claim-status">{error}</p> : null}

      <form onSubmit={saveSettings} style={{ display: 'grid', gap: 12, maxWidth: 420 }}>
        <label>
          <input
            type="checkbox"
            checked={settings.store_open !== false}
            onChange={(e) => setSettings({ ...settings, store_open: e.target.checked })}
          />{' '}
          Store open
        </label>
        <label>
          Cash App handle
          <input
            value={settings.cashapp_handle || ''}
            onChange={(e) => setSettings({ ...settings, cashapp_handle: e.target.value })}
          />
        </label>
        <label>
          Venmo handle
          <input
            value={settings.venmo_handle || ''}
            onChange={(e) => setSettings({ ...settings, venmo_handle: e.target.value })}
          />
        </label>
        <button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save settings'}</button>
      </form>

      <h3 style={{ marginTop: 24 }}>Products</h3>
      <form onSubmit={addProduct} style={{ display: 'grid', gap: 8, maxWidth: 480 }}>
        <input placeholder="Name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} required />
        <input placeholder="Price" type="number" value={draft.price} onChange={(e) => setDraft({ ...draft, price: e.target.value })} />
        <input placeholder="Photo URL" value={draft.photo_url} onChange={(e) => setDraft({ ...draft, photo_url: e.target.value })} />
        <input placeholder="Sizes (S, M, L)" value={draft.sizes} onChange={(e) => setDraft({ ...draft, sizes: e.target.value })} />
        <input placeholder="Stock" type="number" value={draft.stock_qty} onChange={(e) => setDraft({ ...draft, stock_qty: e.target.value })} />
        <button type="submit">Add product</button>
      </form>
      <ul>
        {products.map((p) => (
          <li key={p.id}>
            {p.photo_url ? <img src={p.photo_url} alt="" width={40} height={40} style={{ objectFit: 'cover', borderRadius: 8, verticalAlign: 'middle', marginRight: 8 }} /> : null}
            <strong>{p.name}</strong> · ${p.price}
            {p.sizes?.length ? ` · ${p.sizes.join('/')}` : ''}
            {p.active === false ? ' · inactive' : ''}
            {' '}
            <button type="button" onClick={() => toggleActive(p)}>{p.active === false ? 'Activate' : 'Deactivate'}</button>
          </li>
        ))}
      </ul>

      <h3 style={{ marginTop: 24 }}>Orders</h3>
      <ul>
        {orders.map((o) => (
          <li key={o.id}>
            <strong>{o.ord_code}</strong> — {o.guest_name}
            {o.guest_table ? ` · table ${o.guest_table}` : ''}
            {' '}· ${o.grand_total} · {o.payment_status || 'pending'} · {o.status}
            <div>
              {(o.items || []).map((line) => (
                <div key={line.id}>{line.quantity}× {line.item_name_snapshot}</div>
              ))}
            </div>
            <button type="button" onClick={() => setOrderStatus(o.id, 'fulfilled')}>Mark fulfilled</button>
            <button type="button" onClick={() => setOrderStatus(o.id, 'cancelled')}>Cancel</button>
          </li>
        ))}
        {!orders.length ? <li style={{ opacity: 0.6 }}>No orders yet</li> : null}
      </ul>
    </div>
  )
}
