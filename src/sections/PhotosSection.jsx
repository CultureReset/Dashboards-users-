import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import {
  formatSize,
  cleanPhotoUrl,
  makeItem,
  nextToUpload,
  queueReducer,
  queueSummary,
} from '../lib/photoUpload'
import { prepareForUpload } from '../lib/shrinkImage'
import {
  listPhotos,
  uploadPhoto,
  addPhotoByUrl,
  setCoverPhoto,
  saveCaption,
  deletePhoto,
} from '../lib/photosApi'

// The owner's photos: add from the phone or computer (or by link), choose the
// cover, caption, delete. It loads and refreshes its own list from the
// owner-scoped /api/business/entity_photos routes, so a change shows at once
// and nothing here ever names a business.

let nextId = 1

export default function PhotosSection() {
  const [photos, setPhotos] = useState([])
  const [status, setStatus] = useState('loading') // loading | ready | error
  const [loadError, setLoadError] = useState('')
  const [queue, dispatch] = useReducer(queueReducer, [])
  const [dragging, setDragging] = useState(false)
  const [notice, setNotice] = useState('') // outcome of the last cover/caption/delete/url change
  const [problem, setProblem] = useState('')
  const [busyId, setBusyId] = useState(null)
  const [editingId, setEditingId] = useState(null)
  const [showUrl, setShowUrl] = useState(false)
  const fileRef = useRef(null)
  const cameraRef = useRef(null)
  const started = useRef(new Set())
  const loadSeq = useRef(0)

  const refresh = useCallback(async () => {
    const seq = ++loadSeq.current
    try {
      const rows = await listPhotos()
      if (seq !== loadSeq.current) return
      setPhotos(rows)
      setStatus('ready')
      setLoadError('')
    } catch (err) {
      if (seq !== loadSeq.current) return
      setLoadError(err.message)
      setStatus((s) => (s === 'ready' ? s : 'error'))
    }
  }, [])

  useEffect(() => {
    refresh()
    return () => {
      loadSeq.current++
    }
  }, [refresh])

  // One file at a time, in the order chosen. The ref keeps a re-run of this
  // effect from sending the same file twice.
  useEffect(() => {
    const next = nextToUpload(queue)
    if (!next || started.current.has(next.id)) return
    started.current.add(next.id)
    dispatch({ type: 'shrinking', id: next.id })
    ;(async () => {
      try {
        let ready
        try {
          ready = await prepareForUpload(next.file)
        } catch (err) {
          // Could not be read as a picture: retrying the same file would not help.
          dispatch({ type: 'reject', id: next.id, error: err.message })
          return
        }
        dispatch({ type: 'start', id: next.id })
        await uploadPhoto(ready)
        dispatch({ type: 'done', id: next.id })
      } catch (err) {
        dispatch({ type: 'fail', id: next.id, error: err.message })
      } finally {
        started.current.delete(next.id)
        refresh()
      }
    })()
  }, [queue, refresh])

  function addFiles(fileList) {
    const files = Array.from(fileList || [])
    if (!files.length) return
    setNotice('')
    setProblem('')
    dispatch({ type: 'add', items: files.map((f) => makeItem(f, nextId++)) })
  }

  function onPick(e) {
    addFiles(e.target.files)
    e.target.value = '' // so choosing the same file again still fires
  }

  function onDrop(e) {
    e.preventDefault()
    setDragging(false)
    addFiles(e.dataTransfer?.files)
  }

  async function change(id, work, done) {
    setBusyId(id)
    setProblem('')
    setNotice('')
    try {
      await work()
      setNotice(done)
      await refresh()
      return true
    } catch (err) {
      setProblem(err.message)
      return false
    } finally {
      setBusyId(null)
    }
  }

  const makeCover = (p) => change(p.id, () => setCoverPhoto(p.id), 'Cover photo changed.')

  const remove = (p) => {
    if (!window.confirm('Delete this photo permanently? Guests will stop seeing it.')) return
    return change(p.id, () => deletePhoto(p.id), 'Photo deleted.')
  }

  const summary = queueSummary(queue)

  return (
    <section className="panel photos-panel" aria-labelledby="photos-heading">
      <h2 id="photos-heading">
        Photos{status === 'ready' ? <span className="count"> ({photos.length})</span> : null}
      </h2>

      <div
        className={`photo-drop${dragging ? ' is-over' : ''}`}
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        <p className="photo-drop-hint">Drag photos here, or choose them from your device. JPG, PNG, WebP, GIF or AVIF, up to 10 MB each.</p>
        <div className="photo-actions">
          <button type="button" className="primary" onClick={() => fileRef.current?.click()}>
            Add photos
          </button>
          <button type="button" className="secondary photo-camera" onClick={() => cameraRef.current?.click()}>
            Take a photo
          </button>
          <button
            type="button"
            className="secondary"
            aria-expanded={showUrl}
            aria-controls="photo-url-form"
            onClick={() => setShowUrl((v) => !v)}
          >
            Add by link
          </button>
        </div>
        <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={onPick} aria-label="Choose photos to upload" data-testid="photo-input" />
        <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden onChange={onPick} aria-label="Take a photo to upload" data-testid="camera-input" />
      </div>

      {showUrl && (
        <UrlForm
          count={photos.length}
          onAdded={async () => {
            setNotice('Photo added.')
            setShowUrl(false)
            await refresh()
          }}
        />
      )}

      {queue.length > 0 && (
        <div className="upload-queue">
          <div className="upload-queue-head">
            <h3>
              {summary.busy
                ? `Uploading ${summary.done + summary.failed + summary.shrinking + summary.uploading} of ${summary.total - summary.rejected}`
                : 'Uploads'}
            </h3>
            {(summary.done > 0 || summary.rejected > 0) && (
              <button type="button" className="link-button" onClick={() => dispatch({ type: 'clearFinished' })}>
                Clear finished
              </button>
            )}
          </div>
          <ul>
            {queue.map((item) => (
              <li key={item.id} className={`upload-item is-${item.status}`}>
                <div className="upload-main">
                  <span className="upload-name">{item.name}</span>
                  <span className="upload-size">{formatSize(item.size)}</span>
                </div>
                <div className="upload-state">
                  {item.status === 'queued' && <span>Waiting</span>}
                  {item.status === 'shrinking' && <span>Shrinking…</span>}
                  {item.status === 'uploading' && (
                    <>
                      <progress aria-label={`Uploading ${item.name}`} />
                      <span>Uploading</span>
                    </>
                  )}
                  {item.status === 'done' && <span className="ok">Uploaded</span>}
                  {(item.status === 'failed' || item.status === 'rejected') && (
                    <span className="bad" role="alert">
                      {item.error}
                    </span>
                  )}
                </div>
                {item.status === 'failed' && (
                  <div className="upload-buttons">
                    <button type="button" className="secondary" onClick={() => dispatch({ type: 'retry', id: item.id })}>
                      Retry<span className="sr-only"> {item.name}</span>
                    </button>
                    <button type="button" className="link-button" onClick={() => dispatch({ type: 'dismiss', id: item.id })}>
                      Dismiss<span className="sr-only"> {item.name}</span>
                    </button>
                  </div>
                )}
                {item.status === 'rejected' && (
                  <div className="upload-buttons">
                    <button type="button" className="link-button" onClick={() => dispatch({ type: 'dismiss', id: item.id })}>
                      Dismiss<span className="sr-only"> {item.name}</span>
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="photo-status" role="status" aria-live="polite">
        {notice}
      </div>
      {problem && (
        <p className="photo-error" role="alert">
          {problem}
        </p>
      )}

      {status === 'loading' && <p className="photo-loading">Loading your photos…</p>}

      {loadError && (
        <div className="photo-error" role="alert">
          <span>{status === 'error' ? loadError : `Your photos may be out of date. ${loadError}`}</span>{' '}
          <button type="button" className="secondary" onClick={refresh}>
            Try again
          </button>
        </div>
      )}

      {status === 'ready' && photos.length === 0 && (
        <p className="photo-empty">No photos yet. Add your first one above. The first photo you add becomes your cover.</p>
      )}

      {photos.length > 0 && (
        <ul className="photo-grid">
          {photos.map((p, i) => (
            <PhotoCard
              key={p.id}
              photo={p}
              index={i}
              total={photos.length}
              busy={busyId === p.id}
              disabled={busyId !== null}
              editing={editingId === p.id}
              onEdit={() => setEditingId(p.id)}
              onCancelEdit={() => setEditingId(null)}
              onSaveCaption={async (caption) => {
                const ok = await change(p.id, () => saveCaption(p.id, caption), 'Caption saved.')
                if (ok) setEditingId(null)
              }}
              onCover={() => makeCover(p)}
              onDelete={() => remove(p)}
            />
          ))}
        </ul>
      )}
    </section>
  )
}

function PhotoCard({ photo, index, total, busy, disabled, editing, onEdit, onCancelEdit, onSaveCaption, onCover, onDelete }) {
  const [draft, setDraft] = useState(photo.caption || '')
  const label = photo.caption || `Photo ${index + 1} of ${total}`
  const alt = photo.caption || `Photo ${index + 1} of ${total}${photo.is_cover ? ' (cover photo)' : ''}`

  useEffect(() => {
    if (editing) setDraft(photo.caption || '')
  }, [editing, photo.caption])

  return (
    <li className={`photo-card${photo.is_cover ? ' is-cover' : ''}`} aria-busy={busy || undefined}>
      <div className="photo-frame">
        <img src={photo.url} alt={alt} loading="lazy" />
        {photo.is_cover && <span className="cover-badge">Cover</span>}
      </div>

      {editing ? (
        <form
          className="caption-form"
          onSubmit={(e) => {
            e.preventDefault()
            onSaveCaption(draft.trim())
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') onCancelEdit()
          }}
        >
          <label>
            <span className="sr-only">Caption for {label}</span>
            <input
              type="text"
              value={draft}
              maxLength={200}
              autoFocus
              placeholder="Describe this photo"
              onChange={(e) => setDraft(e.target.value)}
            />
          </label>
          <div className="photo-buttons">
            <button type="submit" className="primary" disabled={busy}>
              {busy ? 'Saving…' : 'Save'}
            </button>
            <button type="button" className="secondary" onClick={onCancelEdit} disabled={busy}>
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <>
          <p className={`photo-caption${photo.caption ? '' : ' is-empty'}`}>{photo.caption || 'No caption'}</p>
          <div className="photo-buttons">
            {!photo.is_cover && (
              <button type="button" className="secondary" disabled={disabled} onClick={onCover} aria-label={`Make cover: ${label}`}>
                {busy ? 'Working…' : 'Make cover'}
              </button>
            )}
            <button type="button" className="secondary" disabled={disabled} onClick={onEdit} aria-label={`Edit caption: ${label}`}>
              Edit caption
            </button>
            <button type="button" className="danger-ghost" disabled={disabled} onClick={onDelete} aria-label={`Delete: ${label}`}>
              Delete
            </button>
          </div>
        </>
      )}
    </li>
  )
}

function UrlForm({ count, onAdded }) {
  const [value, setValue] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e) {
    e.preventDefault()
    const url = cleanPhotoUrl(value)
    if (!url) return setError('Paste a full link that starts with http:// or https://')
    setBusy(true)
    setError('')
    try {
      await addPhotoByUrl(url, count)
      await onAdded()
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  return (
    <form id="photo-url-form" className="url-form" onSubmit={submit} noValidate>
      <label>
        <span>Photo link</span>
        <input type="url" inputMode="url" value={value} placeholder="https://" onChange={(e) => setValue(e.target.value)} aria-invalid={error ? 'true' : undefined} />
      </label>
      <button type="submit" className="primary" disabled={busy}>
        {busy ? 'Adding…' : 'Add'}
      </button>
      {error && (
        <p className="photo-error" role="alert">
          {error}
        </p>
      )}
    </form>
  )
}
