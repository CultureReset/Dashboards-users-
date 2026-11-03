import useLongPress from './useLongPress'

// THE tile. Every tile on the launcher — apps, sections, Setup, "Add app" — is
// this markup and nothing else, and every visual choice in it is a class whose
// rules live in theme.css. To change what a tile looks like, change this file
// and theme.css; nothing else knows how a tile is drawn.
//
// tile: { id, kind, name, icon, status, badge, attention, off }
//   icon    an emoji, or an https:/data:image URL (an SDK app's own icon)
//   badge   a short count or word shown on the corner; `attention` alone shows a dot

function Icon({ icon }) {
  if (typeof icon === 'string' && /^(https:\/\/|data:image\/)/.test(icon)) {
    return <img src={icon} alt="" loading="lazy" draggable="false" />
  }
  return <>{icon || '📦'}</>
}

export default function Tile({
  tile,
  index = 0,
  count = 1,
  editing = false,
  onOpen,
  onLongPress,
  onMove,
  onHide,
}) {
  const press = useLongPress(onLongPress)
  const hasBadge = tile.badge !== null && tile.badge !== undefined && tile.badge !== ''
  const spoken = [tile.name, tile.status, tile.attention ? 'needs attention' : '']
    .filter(Boolean)
    .join(', ')

  const face = (
    <>
      <span className="fl-tile-icon" aria-hidden="true"><Icon icon={tile.icon} /></span>
      <span className="fl-tile-name">{tile.name}</span>
      {tile.status && <span className="fl-tile-status" title={tile.status}>{tile.status}</span>}
      {hasBadge ? (
        <span className="fl-tile-badge" aria-hidden="true">{tile.badge}</span>
      ) : tile.attention ? (
        <span className="fl-tile-dot" aria-hidden="true" />
      ) : null}
    </>
  )

  return (
    <li
      className="fl-tile"
      data-kind={tile.kind}
      data-attention={tile.attention ? 'true' : undefined}
      data-off={tile.off ? 'true' : undefined}
      data-editing={editing ? 'true' : undefined}
    >
      {editing ? (
        <div role="group" aria-label={`${tile.name}, position ${index + 1} of ${count}`} className="fl-tile-edit">
          <div className="fl-tile-face">{face}</div>
          <div className="fl-tile-controls">
            <button
              type="button"
              className="fl-ctl fl-ctl-prev"
              onClick={() => onMove?.(-1)}
              disabled={index === 0}
              aria-label={`Move ${tile.name} earlier`}
            >
              <span aria-hidden="true">‹</span>
            </button>
            <button type="button" className="fl-ctl fl-ctl-hide" onClick={onHide} aria-label={`Hide ${tile.name}`}>
              <span aria-hidden="true">✕</span>
            </button>
            <button
              type="button"
              className="fl-ctl fl-ctl-next"
              onClick={() => onMove?.(1)}
              disabled={index === count - 1}
              aria-label={`Move ${tile.name} later`}
            >
              <span aria-hidden="true">›</span>
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          className="fl-tile-face fl-tile-open"
          data-tile-id={tile.id}
          aria-label={spoken}
          onClick={() => onOpen?.(tile)}
          {...(onLongPress ? press : {})}
        >
          {face}
        </button>
      )}
    </li>
  )
}
