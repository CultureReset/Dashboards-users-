import { useMemo, useState } from 'react'
import { buildCatalog } from '../lib/sectionCatalog'
import { getColumns, isEditableColumn } from '../lib/schemaDiscovery'
import RowEditor from './RowEditor'
import { createRow } from '../lib/writeEntityData'
import { recommendedTables } from '../lib/setupGuide'

// "Add something" — the catalog of everything this business could start using,
// not just what it already has.
//
// Picking an entry opens the same schema-built form the rest of the dashboard
// uses. Saving writes the first row, which is what turns the table into a real
// section on the next load.

export default function AddSection({ allTables, activeKeys, onDone, onCancel, industry }) {
  const [query, setQuery] = useState('')
  const [picked, setPicked] = useState(null)
  const [advanced, setAdvanced] = useState(false)
  const recommended = useMemo(() => new Set(recommendedTables(industry)), [industry])

  // getColumns comes from the live schema read, so submission tables are
  // recognised by their shape rather than by being on a list.
  const catalog = useMemo(
    () => buildCatalog(allTables, activeKeys, getColumns),
    [allTables, activeKeys]
  )

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return catalog
      .map((group) => ({
        ...group,
        entries: group.entries.filter(
          (e) =>
            (advanced || recommended.has(e.table)) &&
            (!q || e.label.toLowerCase().includes(q) || e.table.toLowerCase().includes(q))
        ),
      }))
      .filter((group) => group.entries.length)
  }, [catalog, query, advanced, recommended])

  const total = catalog.reduce((n, g) => n + g.entries.length, 0)

  if (picked) {
    const editable = getColumns(picked.table).filter(isEditableColumn)
    return (
      <div className="panel">
        <h2>
          {picked.icon} Add {picked.label}
        </h2>
        <p className="claim-sub">
          First entry for this business. Saving creates the {picked.label}{' '}
          section.
        </p>
        {editable.length === 0 && (
          <p className="auth-error">
            The schema for <code>{picked.table}</code> hasn't loaded, so this
            form has no fields yet. Reload and try again.
          </p>
        )}
        {editable.length > 0 ? <RowEditor
          table={picked.table}
          row={null}
          onSave={async (values) => {
            await createRow(picked.table, values)
            onDone?.(picked.table)
          }}
          onCancel={() => setPicked(null)}
          onDelete={null}
        /> : <button type="button" onClick={() => setPicked(null)}>Back to sections</button>}
      </div>
    )
  }

  return (
    <div className="panel">
      <h2>Add to your dashboard</h2>
      <p className="claim-sub">
        Start with common sections for your business. Pick one and add your
        first entry — it becomes a section straight away. Other supported
        sections remain available under advanced sections.
      </p>
      <label className="catalog-advanced"><input type="checkbox" checked={advanced} onChange={event => setAdvanced(event.target.checked)} /> Show all advanced sections</label>

      <input
        className="picker-search"
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={advanced ? `Search ${total} supported sections…` : 'Search recommended sections…'}
        aria-label="Search sections"
        autoFocus
      />

      {filtered.length === 0 ? (
        <p className="claim-empty">
          {total === 0
            ? "You're already using everything available."
            : query ? `Nothing matches "${query}". Try advanced sections for more choices.` : 'No recommended sections to add. Open advanced sections to browse more.'}
        </p>
      ) : (
        filtered.map((group) => (
          <div key={group.group} className="catalog-group">
            <h3 className="catalog-group-name">{group.group}</h3>
            <div className="catalog-grid">
              {group.entries.map((entry) => (
                <button
                  key={entry.table}
                  className="catalog-item"
                  onClick={() => setPicked(entry)}
                  title={entry.table}
                >
                  <span className="catalog-icon">{entry.icon}</span>
                  <span className="catalog-label">{entry.label}</span>
                </button>
              ))}
            </div>
          </div>
        ))
      )}

      <div className="section-tools">
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  )
}
