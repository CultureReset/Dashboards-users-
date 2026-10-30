/**
 * Shown when a module is enabled for this business but has no rows yet.
 * Keeps the tab visible (pre-build / claim flow) and offers Add.
 */
export default function EmptyModulePanel({ section, onAdd }) {
  const label = section?.label || 'This section'
  return (
    <div className="panel empty-module-panel">
      <h2>{label}</h2>
      <p className="claim-sub">
        This is on for your business, but nothing has been added yet.
      </p>
      {onAdd && (
        <button type="button" className="primary" onClick={onAdd}>
          Add {label.toLowerCase()}
        </button>
      )}
    </div>
  )
}
