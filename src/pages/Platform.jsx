import { useCallback, useEffect, useState } from 'react'
import { auth, businesses, store } from '../lib/paperclip'

export default function Platform() {
  const [session, setSession] = useState(undefined)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [companies, setCompanies] = useState([])
  const [companyId, setCompanyId] = useState('')
  const [items, setItems] = useState([])
  const [menu, setMenu] = useState([])
  const [error, setError] = useState('')

  const loadCompany = useCallback(async (id) => {
    const [listed, opened] = await Promise.all([store.list(id), store.menu(id)])
    setItems(Array.isArray(listed) ? listed : [])
    const labels = opened?.visible?.map((key) => opened.catalog?.find((entry) => entry.key === key)?.label || key) || []
    setMenu(labels)
  }, [])

  const load = useCallback(async () => {
    try {
      const who = await auth.session()
      setSession(who)
      if (!who) return
      const mine = await businesses.mine()
      const rows = Array.isArray(mine) ? mine : mine?.companies || []
      setCompanies(rows)
      const id = rows[0]?.id || ''
      setCompanyId(id)
      if (id) await loadCompany(id)
      setError('')
    } catch (err) {
      setError(err.message)
    }
  }, [loadCompany])

  useEffect(() => { load() }, [load])

  if (session === undefined) return <p className="claim-sub">Loading…</p>
  if (!session) {
    return (
      <form
        className="auth-card"
        onSubmit={async (event) => {
          event.preventDefault()
          try {
            await auth.signIn(email.trim(), password)
            await load()
          } catch (err) {
            setError(err.message)
          }
        }}
      >
        <h2>Platform</h2>
        <p className="claim-sub">This tab uses the Paperclip sign-in. The rest of the dashboard does not.</p>
        <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Email" required />
        <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Password" required />
        {error ? <p className="auth-error">{error}</p> : null}
        <button className="primary" type="submit">Sign in</button>
      </form>
    )
  }

  return (
    <section className="panel">
      <h2>Platform</h2>
      {error ? <p className="auth-error">{error}</p> : null}
      {companies.length > 1 ? (
        <select value={companyId} onChange={async (event) => {
          setCompanyId(event.target.value)
          await loadCompany(event.target.value)
        }}>
          {companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}
        </select>
      ) : null}
      <h3>Menu</h3>
      <div className="generic-chips">
        {menu.map((label) => <span key={label} className="chip">{label}</span>)}
      </div>
      <h3>Store</h3>
      {items.map((item) => (
        <div key={item.id} className="list-row">
          <strong>{item.name}</strong>
          <span>{item.installed ? `Installed v${item.installedVersion}` : 'Not installed'}</span>
          {item.installed ? (
            item.updateAvailable ? <button className="primary" type="button" onClick={() => store.update(companyId, item.id).then(() => loadCompany(companyId))}>Update</button> : null
          ) : (
            <button className="primary" type="button" onClick={() => store.install(companyId, item.id).then(() => loadCompany(companyId))}>Install</button>
          )}
        </div>
      ))}
    </section>
  )
}
