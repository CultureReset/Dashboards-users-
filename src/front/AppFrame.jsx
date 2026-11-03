import { useEffect, useRef } from 'react'

// One app, full screen: a back button, the app's title, and the screen itself.
//
// The content is whatever the dashboard already renders for that app — the
// frame adds the chrome and nothing else, so every existing page and section
// works unchanged inside it. With no `app` it renders its children untouched,
// which is how Dashboard can always wrap its screen in a frame.
//
//   app: { title, icon } | null     what is open
//   onBack()                        back to the launcher
export default function AppFrame({ app, onBack, children }) {
  const headingRef = useRef(null)
  const identity = app ? `${app.title}|${app.icon}` : ''

  // Opening an app is a screen change: start at the top, and put the screen
  // reader's cursor on the new title rather than leaving it on a tile that is
  // no longer there.
  useEffect(() => {
    if (!identity) return
    window.scrollTo?.(0, 0)
    headingRef.current?.focus({ preventScroll: true })
  }, [identity])

  if (!app) return <>{children}</>

  return (
    <section className="fl-frame" aria-labelledby="fl-frame-title">
      <header className="fl-frame-head">
        <button type="button" className="fl-back" onClick={onBack} aria-label="Back to home">
          <span aria-hidden="true">‹</span>
          <span className="fl-back-text">Home</span>
        </button>
        <h1 id="fl-frame-title" className="fl-frame-title" ref={headingRef} tabIndex={-1}>
          <span className="fl-frame-icon" aria-hidden="true">{/^(https:\/\/|data:image\/)/.test(app.icon || '') ? '' : app.icon}</span>
          <span className="fl-frame-name">{app.title}</span>
        </h1>
      </header>
      <div className="fl-frame-body">{children}</div>
    </section>
  )
}
