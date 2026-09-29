import { useCallback, useEffect, useState } from 'react'
import {
  fetchAutomations, updateAutomation, runAutomation, fetchRuns, upgradeAutomation, rotateHook, describeTrigger,
} from '../lib/automations'
import { formatDateTime } from '../lib/format'

// Automations — what the operator pushed to this business.
//
// One card per automation. The business can switch it on or off, fill in the
// settings it asks for, run it now, pull the newest version when one is
// waiting, and open its run history to see exactly what each run did. Nothing
// is built here; the building happens in the admin console.

export default function Automations({ onCountChange }) {
  const [items, setItems] = useState(null)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    try {
      const data = await fetchAutomations()
      setItems(data.automations || [])
      setError('')
      onCountChange?.((data.automations || []).length)
    } catch (err) {
      setError(err.message)
      setItems([])
    }
  }, [onCountChange])

  useEffect(() => { load() }, [load])

  if (items === null) {
    return (
      <div className="dashboard-loading">
        <div className="spinner" />
        <span>Loading automations…</span>
      </div>
    )
  }

  const updates = items.filter((a) => a.update_available).length

  return (
    <div className="panel">
      <h2>Automations</h2>
      <p className="claim-sub">
        Things that run for you — on a schedule, when something happens, or when you tap Run.
        {updates > 0 && <> <b>{updates} update{updates === 1 ? '' : 's'} waiting.</b></>}
      </p>

      {error && <p className="auth-error">{error}</p>}

      {items.length === 0 && !error && (
        <p className="claim-empty">Nothing has been set up for you yet. When something is, it appears here.</p>
      )}

      <div className="auto-list">
        {items.map((a) => (
          <AutomationCard key={a.id} automation={a} onChanged={load} />
        ))}
      </div>
    </div>
  )
}

function AutomationCard({ automation: a, onChanged }) {
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [config, setConfig] = useState(a.config || {})
  const [dirty, setDirty] = useState(false)
  const [runs, setRuns] = useState(null)
  const [lastResult, setLastResult] = useState(null)
  const [hookUrl, setHookUrl] = useState(a.hook_url)

  useEffect(() => { setConfig(a.config || {}); setDirty(false) }, [a.config])

  async function act(kind, work) {
    setBusy(kind)
    setError('')
    try {
      await work()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy('')
    }
  }

  const toggle = () => act('toggle', async () => { await updateAutomation(a.id, { enabled: !a.enabled }); onChanged() })
  const saveConfig = () => act('save', async () => { await updateAutomation(a.id, { config }); setDirty(false); onChanged() })
  const upgrade = () => act('upgrade', async () => { await upgradeAutomation(a.id); onChanged() })
  const run = () => act('run', async () => {
    const { result } = await runAutomation(a.id)
    setLastResult(result)
    if (runs) setRuns((await fetchRuns(a.id)).runs)
    onChanged()
  })
  const showRuns = () => act('runs', async () => { setRuns((await fetchRuns(a.id)).runs) })
  const rotate = () => act('rotate', async () => {
    if (!confirm('The current URL will stop working. Continue?')) return
    setHookUrl((await rotateHook(a.id)).hook_url)
  })

  const schema = Array.isArray(a.config_schema) ? a.config_schema : []

  return (
    <div className={`auto-card${a.enabled ? '' : ' off'}`}>
      <div className="auto-head">
        <span className="auto-icon">{a.icon || '⚡'}</span>
        <div className="auto-title">
          <b>{a.name}</b>
          <span className="auto-meta">
            {describeTrigger(a.trigger)} · v{a.version}
            {a.update_available && <span className="auto-update"> · v{a.latest_version} available</span>}
          </span>
        </div>
        <button
          type="button"
          className={`auto-switch${a.enabled ? ' on' : ''}`}
          role="switch"
          aria-checked={a.enabled}
          aria-label={a.enabled ? 'Switch off' : 'Switch on'}
          disabled={busy === 'toggle'}
          onClick={toggle}
        />
      </div>

      {a.description && <p className="auto-desc">{a.description}</p>}

      {a.update_available && (
        <div className="auto-banner">
          <span>A newer version is ready.</span>
          <button type="button" onClick={upgrade} disabled={!!busy}>
            {busy === 'upgrade' ? 'Updating…' : `Update to v${a.latest_version}`}
          </button>
        </div>
      )}

      {schema.length > 0 && (
        <div className="auto-settings">
          <h3>Settings</h3>
          {schema.map((f) => (
            <label key={f.key} className="editor-field">
              <span>{f.label || f.key}{f.required ? ' *' : ''}</span>
              <SettingInput
                field={f}
                value={config[f.key] ?? f.default ?? (f.type === 'boolean' ? false : '')}
                onChange={(v) => { setConfig((c) => ({ ...c, [f.key]: v })); setDirty(true) }}
              />
              {f.help && <small className="auto-help">{f.help}</small>}
            </label>
          ))}
          {dirty && (
            <div className="editor-actions">
              <button type="button" className="primary" onClick={saveConfig} disabled={!!busy}>
                {busy === 'save' ? 'Saving…' : 'Save settings'}
              </button>
            </div>
          )}
        </div>
      )}

      {hookUrl && (
        <div className="auto-hook">
          <h3>Your URL</h3>
          <p className="auto-help">POST anything to this address and the automation runs with it.</p>
          <code className="auto-code">{hookUrl}</code>
          <div className="section-tools" style={{ marginTop: 8, paddingTop: 0, borderTop: 0 }}>
            <button type="button" onClick={() => navigator.clipboard?.writeText(hookUrl)}>Copy</button>
            <button type="button" onClick={rotate} disabled={!!busy}>New URL</button>
          </div>
        </div>
      )}

      <div className="auto-foot">
        <span className="auto-last">
          {a.last_run_at
            ? <><StatusDot status={a.last_run_status} /> Last run {formatDateTime(a.last_run_at)}</>
            : 'Never run'}
        </span>
        <div className="auto-actions">
          <button type="button" onClick={runs ? () => setRuns(null) : showRuns} disabled={busy === 'runs'}>
            {runs ? 'Hide history' : 'History'}
          </button>
          <button type="button" className="primary" onClick={run} disabled={!!busy}>
            {busy === 'run' ? 'Running…' : 'Run now'}
          </button>
        </div>
      </div>

      {error && <p className="auth-error">{error}</p>}

      {lastResult && (
        <div className="auto-result">
          <b><StatusDot status={lastResult.status} /> {lastResult.status === 'ok' ? 'Done' : lastResult.status === 'skipped' ? 'Stopped early' : 'Failed'}</b>
          {lastResult.error && <span className="auto-err"> — {lastResult.error}</span>}
          <StepList steps={lastResult.steps_log} output={lastResult.output} />
        </div>
      )}

      {runs && (
        <div className="auto-history">
          <h3>History</h3>
          {runs.length === 0 && <p className="auto-help">No runs yet.</p>}
          {runs.map((r) => <RunEntry key={r.id} run={r} />)}
        </div>
      )}
    </div>
  )
}

function SettingInput({ field, value, onChange }) {
  const common = { id: `cfg-${field.key}`, value: value ?? '', onChange: (e) => onChange(e.target.value) }
  if (field.type === 'boolean') {
    return (
      <select id={common.id} value={value ? 'true' : 'false'} onChange={(e) => onChange(e.target.value === 'true')}>
        <option value="true">Yes</option>
        <option value="false">No</option>
      </select>
    )
  }
  if (field.type === 'select') {
    return (
      <select {...common}>
        <option value="">—</option>
        {(field.options || []).map((o) => {
          const v = typeof o === 'object' ? o.value : o
          const l = typeof o === 'object' ? o.label : o
          return <option key={String(v)} value={v}>{l}</option>
        })}
      </select>
    )
  }
  if (field.type === 'textarea') return <textarea rows={3} {...common} />
  if (field.type === 'number') return <input type="number" step="any" {...common} onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))} />
  if (field.type === 'tel') return <input type="tel" {...common} />
  if (field.type === 'email') return <input type="email" {...common} />
  return <input type="text" {...common} />
}

function StatusDot({ status }) {
  return <span className={`auto-dot ${status || ''}`} aria-hidden="true" />
}

function RunEntry({ run }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="auto-run">
      <button type="button" className="auto-run-head" onClick={() => setOpen((v) => !v)}>
        <StatusDot status={run.status} />
        <span className="auto-run-when">{formatDateTime(run.started_at)}</span>
        <span className="auto-run-how">{run.trigger}{run.dry_run ? ' · test' : ''}</span>
        <span className="auto-run-caret">{open ? '▾' : '▸'}</span>
      </button>
      {run.error && <p className="auto-err">{run.error}</p>}
      {open && <StepList steps={run.steps_log} output={run.output} />}
    </div>
  )
}

function StepList({ steps = [], output }) {
  const notices = output?.notices || []
  return (
    <div className="auto-steps">
      {steps.map((s, i) => (
        <div key={`${s.id}-${i}`} className="auto-step">
          <StatusDot status={s.status === 'dry_run' ? 'ok' : s.status} />
          <span className="auto-step-name">{s.name || s.id}</span>
          <span className="auto-step-status">{s.status.replace('_', ' ')}</span>
          {s.error && <span className="auto-err">{s.error}</span>}
        </div>
      ))}
      {notices.map((n, i) => (
        <div key={`n-${i}`} className={`auto-note ${n.level || 'info'}`}>
          <b>{n.title}</b>
          {n.message && <span>{n.message}</span>}
        </div>
      ))}
    </div>
  )
}
