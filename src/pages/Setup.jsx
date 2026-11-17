import { useEffect, useState } from 'react'
import { api } from '../lib/apiClient'
import endpoints from '../lib/endpoints'
import { calendarStatus } from '../lib/setupGuide'

const SOURCES = {
  calendar: () => api.get(endpoints.ical.overview()),
  facts: () => api.get(endpoints.facts.questions()),
  tools: () => api.get(endpoints.connections.list()),
  store: () => api.get(endpoints.store.list()),
}

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`

export default function Setup({ entity, onOpen }) {
  const [status, setStatus] = useState({})
  const [refresh, setRefresh] = useState(0)
  useEffect(() => {
    let cancelled = false
    setStatus({})
    // Each source can fail independently; never show a failed lookup as empty.
    Object.entries(SOURCES).forEach(async ([key, read]) => {
      try {
        const data = await read()
        if (!cancelled) setStatus(previous => ({ ...previous, [key]: { data } }))
      } catch (error) {
        if (!cancelled) setStatus(previous => ({ ...previous, [key]: { error: error.message } }))
      }
    })
    return () => { cancelled = true }
  }, [refresh])

  const recorded = (key, describe) => status[key]?.error
    ? 'Could not check — open to retry'
    : !status[key] ? 'Checking…' : describe(status[key].data)
  const cards = [
    { key: 'profile', title: '1. Check your business profile', status: entity?.name || 'Your business workspace',
      text: 'Your name, phone, website, address, prices and the yes/no details guests look for. Start here so the basics are right.', action: 'Edit business profile' },
    { key: 'data', title: '2. Add your business information', status: entity?.name || 'Your business workspace',
      text: 'Add hours, photos, offerings, prices and policies. Start with the recommended sections for your business.', action: 'Add business data' },
    { key: 'facts', title: '3. Answer what guests ask', status: recorded('facts', data => (data.questions || []).length ? `${(data.questions || []).length} unanswered` : 'All answered'),
      text: 'Pet friendly? Wheelchair accessible? Guests search by these. Answer the ones we do not know yet.', action: 'Answer questions' },
    { key: 'store', title: '4. Choose your apps', status: recorded('store', data => `${(data.items || []).filter(item => item.installed).length} installed`),
      text: 'Install the modules you need, then enter their information and settings. Installing an app does not import your data.', action: 'Open app store' },
    { key: 'calendar', title: '5. Connect your calendars', status: recorded('calendar', data => calendarStatus(data.units || [])),
      text: 'Paste an iCal export link from your booking platform and run Sync now. iCal supplies blocked dates, not guest or payment details.', action: 'Connect calendars' },
    { key: 'tools', title: '6. Connect your tools', status: recorded('tools', data => data.composio_configured ? plural((data.tools || []).filter(tool => tool.connection?.status === 'connected').length, 'tool') + ' connected' : 'Connection service needs configuration'),
      text: 'Choose supported tools and authorize them. Review each connection before relying on its data; authorization alone is not a verified import.', action: 'Connect tools' },
    { key: 'automations', title: '7. Review your workflows', status: 'Optional — check available workflows',
      text: 'Open the workflows assigned to your business, review their settings and permissions, and inspect the result of a supported test.', action: 'Open automations' },
    { key: 'ghost', title: '8. Connect local execution', status: 'Optional — verify your device connection',
      text: 'Use My Ghost for an enrolled device, or your operator-configured computer connection. Confirm approvals and an action receipt before relying on automation.', action: 'Open My Ghost' },
  ]
  return (
    <section className="panel setup-page">
      <h2>Set up your business</h2>
      <p className="claim-sub">Your dashboard is the home for your data, apps and connections. Choose what your business needs; you can return here at any time.</p>
      <button type="button" className="secondary" onClick={() => setRefresh(value => value + 1)}>Refresh setup status</button>
      <div className="setup-guide-grid">
        {cards.map(card => (
          <article className="setup-guide-card" key={card.key}>
            <h3>{card.title}</h3>
            <p className="setup-guide-status" role="status">{card.status}</p>
            <p>{card.text}</p>
            {status[card.key]?.error && <p className="auth-error">{status[card.key].error}</p>}
            <button type="button" className="primary" onClick={() => onOpen(card.key)}>{card.action}</button>
          </article>
        ))}
      </div>
      <p className="claim-sub">Booking emails and bulk imports are separate data sources. Ask your administrator to configure intake and verify a sample record. Your public listing is managed separately from dashboard access.</p>
    </section>
  )
}
