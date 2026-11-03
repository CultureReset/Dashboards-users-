import { useId, useMemo, useRef, useState } from 'react'
import { useToast } from '../components/Toast'
import { GCR_API_BASE } from './api'
import { qrModules, qrPath, qrSize } from './qr'
import { publicUrl } from './validate'

/**
 * The public link, when the app has a public surface (docs/APP-SDK.md: the
 * link is `<API origin><public.path>`, named by the install, never by a business).
 * Copy, Open, and a QR code drawn here with no dependency (qr.js).
 */
export default function PublicLink({ app }) {
  const url = publicUrl(GCR_API_BASE, app)
  const modules = useMemo(() => (url ? qrModules(url) : null), [url])
  const [copied, setCopied] = useState(false)
  const toast = useToast()
  const uid = useId().replace(/:/g, '')
  const input = useRef(null)
  const timer = useRef(null)
  if (!url) return null

  const title = app.public.surfaces?.[0]?.title || `${app.name} link`
  const open = app.resources.filter((r) => app.public.resources?.includes(r.id) && (r.public === 'append' || r.public === 'read-append'))
  const readable = app.resources.filter((r) => app.public.resources?.includes(r.id) && (r.public === 'read' || r.public === 'read-append'))

  const copy = async () => {
    let ok = false
    try {
      await navigator.clipboard.writeText(url)
      ok = true
    } catch {
      // Older or locked-down browsers: select the text so the owner can copy it by hand.
      try {
        input.current?.focus()
        input.current?.select()
        ok = document.execCommand?.('copy') === true
      } catch {
        ok = false
      }
    }
    if (ok) {
      setCopied(true)
      toast.success('Link copied')
      clearTimeout(timer.current)
      timer.current = setTimeout(() => setCopied(false), 2500)
    } else {
      input.current?.select()
      toast.info('Press and hold the link to copy it.')
    }
  }

  return (
    <section className="sa-card" aria-labelledby={`sa-pub-${uid}`} id="sa-public">
      <h2 id={`sa-pub-${uid}`} className="sa-h2" tabIndex={-1}>Your public link</h2>
      <p className="sa-muted">
        {title}. Share this link, or show the code, and customers can
        {open.length ? ` add to ${open.map((r) => r.label.toLowerCase()).join(' and ')}` : ' use this app'}
        {open.some((r) => r.public === 'append') ? '. Only you can read what they send.' : '.'}
        {readable.length ? ` They can also read ${readable.map((r) => r.label.toLowerCase()).join(' and ')}.` : ''}
      </p>
      <div className="sa-public">
        <div className="sa-public-main">
          <label htmlFor={`sa-url-${uid}`} className="sa-label"><span>Link to share</span></label>
          <input id={`sa-url-${uid}`} ref={input} className="sa-input sa-mono" readOnly value={url} onFocus={(e) => e.target.select()} />
          <div className="sa-row sa-public-buttons">
            <button type="button" className="primary sa-btn" onClick={copy}>{copied ? 'Copied' : 'Copy link'}</button>
            <a className="sa-btn sa-btn-link secondary" href={url} target="_blank" rel="noopener noreferrer">Open<span className="sa-sr"> the public link in a new tab</span></a>
          </div>
          <p className="sa-sr" role="status" aria-live="polite">{copied ? 'Link copied to the clipboard.' : ''}</p>
        </div>
        {modules ? (
          <figure className="sa-qr">
            <svg viewBox={`0 0 ${qrSize(modules)} ${qrSize(modules)}`} role="img" aria-label={`QR code for the ${title} link`} shapeRendering="crispEdges">
              <rect width="100%" height="100%" fill="#ffffff" />
              <path d={qrPath(modules)} fill="#000000" />
            </svg>
            <figcaption className="sa-muted">Scan to open</figcaption>
          </figure>
        ) : null}
      </div>
      <details className="sa-details">
        <summary>For your website</summary>
        <p className="sa-muted">A page on your own site can read the form from this address and send each submission back to it.</p>
        <p className="sa-mono sa-small">GET {url}</p>
        {open.map((r) => <p key={r.id} className="sa-mono sa-small">POST {url}/{r.id}</p>)}
      </details>
    </section>
  )
}
