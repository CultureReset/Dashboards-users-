import { Component } from 'react'

// A render error anywhere below should leave the owner with a way forward, not
// a blank page. Two sizes:
//
//   <ErrorBoundary>                       whole app: full-screen recover card
//   <ErrorBoundary inline resetKey={x}>   one screen: nav stays usable, and
//                                         changing `resetKey` (tab switch)
//                                         tries again by itself
export default class ErrorBoundary extends Component {
  state = { error: null, key: this.props.resetKey }

  static getDerivedStateFromError(error) {
    return { error }
  }

  static getDerivedStateFromProps(props, state) {
    if (props.resetKey !== state.key) return { error: null, key: props.resetKey }
    return null
  }

  componentDidCatch(error, info) {
    console.error('Dashboard render error', error, info?.componentStack)
  }

  reset = () => this.setState({ error: null })

  render() {
    if (!this.state.error) return this.props.children
    const message = this.state.error?.message || 'Unexpected error'

    if (this.props.inline) {
      return (
        <div className="panel" role="alert">
          <h2>This screen couldn't be shown</h2>
          <p className="claim-sub">Your data is safe. {message}</p>
          <p>
            <button type="button" className="primary" onClick={this.reset}>Try again</button>
          </p>
        </div>
      )
    }

    return (
      <div className="auth-screen" role="alert">
        <div className="auth-card">
          <h1>Something went wrong</h1>
          <p className="claim-sub">
            The dashboard hit an unexpected problem. Nothing you saved was lost.
          </p>
          <p className="claim-status">{message}</p>
          <button type="button" className="primary" onClick={this.reset}>Try again</button>
          <button type="button" className="auth-switch" onClick={() => window.location.reload()}>
            Reload the page
          </button>
        </div>
      </div>
    )
  }
}
