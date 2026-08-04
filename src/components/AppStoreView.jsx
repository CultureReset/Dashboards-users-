import { useEffect, useMemo, useRef, useState } from 'react'
import './AppStoreView.css'

// The App Store, as one component.
//
// Identical file in the business dashboard and the admin console. Everything
// that differs between them arrives as props — the host supplies the data and
// says what a row can do; nothing about a tool, a category or a host is
// written in here.
//
// Composio carries over a thousand toolkits, which decides the shape:
//
//   list on a phone     one per row, the way a phone app store does it. A
//                       two-column grid of cards at 390px gives every tool a
//                       postage stamp and no room for what it actually does.
//   grid on desktop     where there is width to use.
//   paged, not endless  connecting sends you to another site and back, and
//                       "page 3 of Marketing" is a place you can return to.
//                       An infinite scroll position is not.
//   pick, then connect  ticking is free; authorising is not. Choose everything
//                       first, then work through them one at a time.

const ALL = '__all__'

/** Brand tile. `logo` is whatever the catalogue stored — usually Composio's URL. */
function Logo({ tool, size = 'md' }) {
  const [failed, setFailed] = useState(false)
  const letter = (tool.name || '?').trim()[0].toUpperCase()

  // No logo, or it failed to load: a coloured monogram, keyed off the id so a
  // tool looks the same on every render without anyone assigning it a colour.
  if (!tool.logo || failed) {
    let h = 0
    for (const c of tool.tool_id || tool.name || '') h = (h * 31 + c.charCodeAt(0)) % 360
    return (
      <span className={`as-logo as-logo--${size} as-logo--mono`} style={{ background: `hsl(${h} 48% 42%)` }} aria-hidden="true">
        {letter}
      </span>
    )
  }
  return (
    <img
      className={`as-logo as-logo--${size}`}
      src={tool.logo}
      alt=""
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
    />
  )
}

function StateTag({ status }) {
  if (!status || status === 'disconnected') return null
  return <span className={`as-state as-state--${status}`}>{status === 'connected' ? 'Connected' : 'Finishing'}</span>
}

export default function AppStoreView({
  title,
  subtitle,
  tools = [],
  categories = [],
  perPage = 20,
  loading = false,
  error = '',
  disabled = false,
  disabledReason = '',
  // What a row can do. The admin console passes onToggleOffer; the business
  // dashboard passes the select/connect handlers. Neither knows about the other.
  onToggleOffer,
  onConnectMany,
  onDisconnect,
  onRetry,
}) {
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState(ALL)
  const [page, setPage] = useState(1)
  const [picked, setPicked] = useState(() => new Set())
  const [detail, setDetail] = useState(null)
  const topRef = useRef(null)

  const curating = typeof onToggleOffer === 'function'

  // Any change to what is being shown starts again at page one; staying on
  // page 4 of a three-page result is how a search looks broken.
  useEffect(() => { setPage(1) }, [query, category, tools.length])

  const catCounts = useMemo(() => {
    const counts = new Map()
    for (const t of tools) {
      const key = t.cat || 'other'
      counts.set(key, (counts.get(key) || 0) + 1)
    }
    const labels = Object.fromEntries(categories.map((c) => [c.cat_id, c.name]))
    return [...counts.entries()]
      .map(([key, n]) => ({ key, n, label: labels[key] || humanize(key) }))
      .sort((a, b) => (a.key === 'other') - (b.key === 'other') || b.n - a.n)
  }, [tools, categories])

  // ─── Searching ──────────────────────────────────────────────────────────
  //
  // Two things were wrong with the obvious version of this.
  //
  // It searched inside the selected category, so with a chip active you could
  // type the exact name of a tool that exists and be told "Nothing matches" —
  // true of that category, wildly untrue of the catalogue. Typing a name is a
  // request to find that thing, wherever it is, so a query now searches
  // everything and the chip steps aside while it runs.
  //
  // And it matched descriptions equally with names, which sounds generous and
  // reads as broken: in a catalogue of a thousand tools, "to" appears in
  // "tool", "automate" and "customer", so short queries excluded almost
  // nothing and the list looked like it had ignored you. Names and ids are
  // matched first; a description-only hit still counts, but sorts below.
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()

    if (!q) {
      return category === ALL ? tools : tools.filter((t) => (t.cat || 'other') === category)
    }

    const scored = []
    for (const t of tools) {
      const name = String(t.name || '').toLowerCase()
      const id = String(t.tool_id || '').toLowerCase()

      // 0 = starts with what you typed, 1 = contains it, 2 = only the blurb.
      let rank
      if (name.startsWith(q) || id.startsWith(q)) rank = 0
      else if (name.includes(q) || id.includes(q)) rank = 1
      else if (String(t.description || '').toLowerCase().includes(q)) rank = 2
      else continue

      scored.push({ t, rank, name })
    }

    scored.sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name))
    return scored.map((s) => s.t)
  }, [tools, category, query])

  const searching = query.trim().length > 0

  const pages = Math.max(1, Math.ceil(matches.length / perPage))
  const current = Math.min(page, pages)
  const shown = matches.slice((current - 1) * perPage, current * perPage)
  const connectedCount = tools.filter((t) => t.connection?.status === 'connected').length

  function togglePick(tool) {
    setPicked((prev) => {
      const next = new Set(prev)
      if (next.has(tool.tool_id)) next.delete(tool.tool_id)
      else next.add(tool.tool_id)
      return next
    })
  }

  function goToPage(n) {
    setPage(n)
    topRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  if (loading) {
    return (
      <div className="as-loading">
        <div className="spinner" />
        <span>Loading tools…</span>
      </div>
    )
  }

  if (error && !tools.length) {
    return (
      <div className="as-wrap">
        <h2 className="as-title">{title}</h2>
        <p className="as-error">{error}</p>
        {onRetry && <button className="as-btn as-btn--primary" onClick={onRetry}>Try again</button>}
      </div>
    )
  }

  return (
    <div className="as-wrap" ref={topRef}>
      <header className="as-head">
        <h2 className="as-title">{title}</h2>
        <p className="as-sub">
          {subtitle ?? (connectedCount
            ? <><b>{connectedCount}</b> connected · {tools.length} available</>
            : <>{tools.length} tools. Tick what you want, connect them at the end.</>)}
        </p>
      </header>

      {disabled && disabledReason && <p className="as-notice">{disabledReason}</p>}
      {error && tools.length > 0 && <p className="as-error">{error}</p>}

      <input
        className="as-search"
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={`Search ${tools.length} tools…`}
        aria-label="Search tools"
      />

      {/* While a search is running the chips are inert: the query already
          searched everything, so letting one look "selected" would claim a
          filter that is not being applied. */}
      {searching ? (
        <p className="as-scope">
          {matches.length === 1 ? '1 tool matches' : `${matches.length} tools match`} “{query}” across all
          categories.{' '}
          <button type="button" onClick={() => setQuery('')}>Clear search</button>
        </p>
      ) : (
        <div className="as-chips" role="group" aria-label="Categories">
          <button
            className="as-chip"
            aria-pressed={category === ALL}
            onClick={() => setCategory(ALL)}
          >
            All <span>{tools.length}</span>
          </button>
          {catCounts.map((c) => (
            <button
              key={c.key}
              className="as-chip"
              aria-pressed={category === c.key}
              onClick={() => setCategory(c.key)}
            >
              {c.label} <span>{c.n}</span>
            </button>
          ))}
        </div>
      )}

      {matches.length === 0 ? (
        <p className="as-empty">
          Nothing in the catalogue matches “{query}”.{' '}
          <button type="button" onClick={() => { setQuery(''); setCategory(ALL) }}>Clear</button>
        </p>
      ) : (
        <ul className="as-list">
          {shown.map((tool) => {
            const status = tool.connection?.status
            const isPicked = picked.has(tool.tool_id)
            return (
              <li className="as-row" key={tool.tool_id} data-picked={isPicked} data-state={status || 'available'}>
                <button className="as-row-open" onClick={() => setDetail(tool)} aria-label={`About ${tool.name}`}>
                  <Logo tool={tool} />
                  <span className="as-row-text">
                    <span className="as-row-name">{tool.name}<StateTag status={status} /></span>
                    <span className="as-row-desc">{tool.description || tool.cat || tool.tool_id}</span>
                  </span>
                </button>

                <div className="as-row-action">
                  {curating ? (
                    <button
                      className="as-switch"
                      role="switch"
                      aria-checked={!!tool.is_active}
                      aria-label={`Offer ${tool.name} in the business store`}
                      onClick={() => onToggleOffer(tool)}
                    />
                  ) : status === 'connected' ? (
                    <button className="as-btn as-btn--quiet" onClick={() => onDisconnect?.(tool)}>Remove</button>
                  ) : (
                    <button
                      className={`as-btn ${isPicked ? 'as-btn--primary' : ''}`}
                      disabled={disabled}
                      onClick={() => togglePick(tool)}
                    >
                      {isPicked ? 'Selected' : status === 'pending' ? 'Finish' : 'Connect'}
                    </button>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {pages > 1 && (
        <nav className="as-pager" aria-label="Pages">
          <span className="as-pager-count">
            {(current - 1) * perPage + 1}–{Math.min(matches.length, current * perPage)} of {matches.length}
          </span>
          <div className="as-pages">
            <button onClick={() => goToPage(current - 1)} disabled={current === 1} aria-label="Previous page">‹</button>
            {pageWindow(current, pages).map((n, i) =>
              n === '…'
                ? <button key={`gap${i}`} disabled>…</button>
                : <button key={n} onClick={() => goToPage(n)} aria-current={n === current ? 'page' : undefined}>{n}</button>
            )}
            <button onClick={() => goToPage(current + 1)} disabled={current === pages} aria-label="Next page">›</button>
          </div>
        </nav>
      )}

      {!curating && picked.size > 0 && (
        <div className="as-tray">
          <span className="as-tray-n"><b>{picked.size}</b> selected</span>
          <button className="as-tray-clear" onClick={() => setPicked(new Set())}>Clear</button>
          <button
            className="as-btn as-btn--primary as-tray-go"
            onClick={() => onConnectMany?.([...picked], () => setPicked(new Set()))}
          >
            Connect {picked.size} tool{picked.size > 1 ? 's' : ''}
          </button>
        </div>
      )}

      {detail && (
        <DetailSheet
          tool={detail}
          picked={picked.has(detail.tool_id)}
          curating={curating}
          disabled={disabled}
          onClose={() => setDetail(null)}
          onPick={() => { togglePick(detail); setDetail(null) }}
          onDisconnect={() => { onDisconnect?.(detail); setDetail(null) }}
        />
      )}
    </div>
  )
}

function DetailSheet({ tool, picked, curating, disabled, onClose, onPick, onDisconnect }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = previous
    }
  }, [onClose])

  const status = tool.connection?.status
  return (
    <div className="as-scrim" onClick={onClose} role="presentation">
      <div className="as-sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={tool.name}>
        <div className="as-sheet-head">
          <Logo tool={tool} size="lg" />
          <div className="as-sheet-id">
            <h3>{tool.name}</h3>
            <div className="as-tags">
              {tool.cat && <span className="as-tag">{humanize(tool.cat)}</span>}
              <span className="as-tag">{status === 'connected' ? 'Connected' : 'Not connected'}</span>
              {tool.auth_scheme && <span className="as-tag">{tool.auth_scheme}</span>}
            </div>
          </div>
          <button className="as-sheet-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <p className="as-sheet-body">
          {tool.description || `Connect ${tool.name} to your dashboard.`}
        </p>
        <p className="as-sheet-body">
          You sign in on {tool.name}’s own site — no keys to copy and nothing to configure here.
          Disconnect whenever you like.
        </p>

        {!curating && (
          <div className="as-sheet-actions">
            {status === 'connected'
              ? <button className="as-btn as-btn--quiet" onClick={onDisconnect}>Remove {tool.name}</button>
              : <button className="as-btn as-btn--primary" disabled={disabled} onClick={onPick}>
                  {picked ? 'Remove from selection' : 'Add to selection'}
                </button>}
          </div>
        )}
      </div>
    </div>
  )
}

/** Page numbers around the current one — forty buttons helps nobody. */
function pageWindow(current, pages) {
  const out = []
  const lo = Math.max(1, current - 1)
  const hi = Math.min(pages, current + 1)
  if (lo > 1) out.push(1)
  if (lo > 2) out.push('…')
  for (let n = lo; n <= hi; n += 1) out.push(n)
  if (hi < pages - 1) out.push('…')
  if (hi < pages) out.push(pages)
  return out
}

function humanize(key) {
  return String(key).replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}
