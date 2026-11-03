import { useEffect, useMemo, useState } from 'react'
import Tile from './Tile'
import AskBar from '../ask/AskBar'
import { ADD_APP_TILE } from './tiles'
import {
  EMPTY_LAYOUT, applyLayout, clearLayout, hideTile, loadLayout, moveTile, saveLayout, showTile,
} from './layout'
import './theme.css'

// The home screen: the business's apps as tiles.
//
// It owns the arrangement (order, hidden) and the Edit mode; it does not know
// what a tile opens. Dashboard builds the tiles (tiles.js) and decides what
// onOpen does, so this file is only layout and interaction.
//
//   slug        the business — layouts are saved per browser *and* per business,
//               so an admin "viewing as" never rearranges one by editing another
//   tiles       from buildTiles(), in default order (the "Add app" tile is added here)
//   onOpen(t)   a tile was opened
//   onAddApp()  the "Add app" tile was opened (the Store)
//   focusId     tile to focus on mount — the one the owner just came back from
//   businessName, viewingAs, onOpenView   for the Ask box on top (src/ask):
//               the business's name, whether an admin is viewing as it, and
//               how to open another screen ('platform', 'ghost')
//
// Mount it with key={slug}: the layout is read once per business.
export default function AppHome({ slug, tiles, onOpen, onAddApp, focusId, businessName, viewingAs = false, onOpenView }) {
  const [layout, setLayout] = useState(() => loadLayout(slug))
  const [editing, setEditing] = useState(false)
  const [note, setNote] = useState('')
  const [prefill, setPrefill] = useState(null) // a tile's "Ask about this" -> the Ask box
  const { visible, hidden } = useMemo(() => applyLayout(tiles, layout), [tiles, layout])
  const isEmpty = !tiles.some((t) => t.kind !== 'core')

  useEffect(() => {
    if (!focusId) return
    const el = document.querySelector(`[data-tile-id="${CSS.escape(focusId)}"]`)
    el?.focus({ preventScroll: true })
  }, [focusId])

  const commit = (next, message) => {
    setLayout(next)
    saveLayout(slug, next)
    setNote(message)
  }

  const move = (tile, delta) => {
    const next = moveTile(tiles, layout, tile.id, delta)
    if (next === layout) return
    const at = applyLayout(tiles, next).visible.findIndex((t) => t.id === tile.id) + 1
    commit(next, `${tile.name} moved to position ${at} of ${visible.length}`)
  }

  const startEditing = () => {
    setEditing(true)
    setNote('Editing. Move or hide apps, then choose Done.')
  }

  return (
    <div
      className="fl-home"
      data-editing={editing ? 'true' : undefined}
      onKeyDown={(e) => { if (editing && e.key === 'Escape') setEditing(false) }}
    >
      <div className="fl-home-head">
        <div>
          <h1 className="fl-home-title">Your apps</h1>
          <p className="fl-home-sub">
            {editing ? 'Move or hide apps. Saved on this device.' : 'Tap an app to open it.'}
          </p>
        </div>
        <button
          type="button"
          className="fl-pill"
          onClick={() => (editing ? setEditing(false) : startEditing())}
          aria-pressed={editing}
        >
          {editing ? 'Done' : 'Edit'}
        </button>
      </div>

      <AskBar
        key={`${slug}:${viewingAs}`}
        slug={slug}
        businessName={businessName}
        viewingAs={viewingAs}
        prefill={prefill}
        onOpenView={onOpenView}
        canOpenGhost={tiles.some((t) => t.target?.view === 'ghost')}
      />

      {isEmpty && !editing && (
        <p className="fl-hint">
          Nothing installed yet. Add an app from the store, or start with Setup.
        </p>
      )}

      <ul className="fl-grid" aria-label="Your apps">
        {visible.map((tile, i) => (
          <Tile
            key={tile.id}
            tile={tile}
            index={i}
            count={visible.length}
            editing={editing}
            onOpen={onOpen}
            onLongPress={editing ? undefined : startEditing}
            onMove={(delta) => move(tile, delta)}
            onHide={() => commit(hideTile(tiles, layout, tile.id), `${tile.name} hidden`)}
            onAsk={() => setPrefill({ text: `About ${tile.name}: `, n: (prefill?.n || 0) + 1 })}
          />
        ))}
        <Tile tile={ADD_APP_TILE} onOpen={onAddApp} />
      </ul>

      {editing && (
        <section className="fl-shelf" aria-label="Hidden apps">
          <h2 className="fl-shelf-title">Hidden</h2>
          {hidden.length === 0 ? (
            <p className="fl-hint">Nothing hidden.</p>
          ) : (
            <ul className="fl-shelf-list">
              {hidden.map((tile) => (
                <li key={tile.id}>
                  <button
                    type="button"
                    className="fl-chip"
                    onClick={() => commit(showTile(tiles, layout, tile.id), `${tile.name} shown`)}
                    aria-label={`Show ${tile.name}`}
                  >
                    <span aria-hidden="true">{/^(https:\/\/|data:image\/)/.test(tile.icon || '') ? '＋' : tile.icon}</span>
                    <span>{tile.name}</span>
                    <span aria-hidden="true" className="fl-chip-add">＋</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <button
            type="button"
            className="fl-link"
            onClick={() => {
              clearLayout(slug)
              setLayout(EMPTY_LAYOUT)
              setNote('Layout reset')
            }}
          >
            Reset layout
          </button>
        </section>
      )}

      <p className="fl-sr" role="status" aria-live="polite">{note}</p>
    </div>
  )
}
