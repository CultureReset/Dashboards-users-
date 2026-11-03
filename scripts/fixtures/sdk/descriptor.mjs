// What GET /api/apps/<id> returns for a manifest, built the way gcr-api-clean's
// lib/appSdk/router.js `descriptor()` builds it (fieldView / resourceView /
// actionView / settingsSchema, copied field for field), plus the synthetic
// manifests the checks and the screenshot stub use. Test support only: the
// dashboard never imports this.

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
export const feedbackManifest = JSON.parse(readFileSync(join(here, 'feedback.manifest.json'), 'utf8'))

const accessOf = (a) => (a.kind === 'read' ? 'read' : a.kind === 'create' || a.kind === 'update' ? 'write' : a.access || 'write')

function actionInput(manifest, action) {
  if (action.kind === 'create' || action.kind === 'update') {
    return (manifest.resources || []).find((x) => x.id === action.resource)?.fields || []
  }
  return Array.isArray(action.input) ? action.input : []
}

const fieldView = (f) => ({
  key: f.key, label: f.label || f.key, type: f.type, required: f.required === true, default: f.default ?? null,
  help: f.help || null, placeholder: f.placeholder || null, options: f.options || null,
  max_length: f.max_length || null, min: f.min ?? null, max: f.max ?? null, ownerOnly: f.ownerOnly === true,
})

const resourceView = (r, count) => ({
  id: r.id, label: r.label, description: r.description || null, title: r.title || r.fields[0].key, public: r.public || 'none',
  fields: r.fields.map(fieldView), ...(count === undefined ? {} : { count }),
})

const actionView = (manifest, a) => ({
  id: a.id, label: a.label || a.id.replace(/_/g, ' '), summary: a.summary, kind: a.kind || 'handler', access: accessOf({ ...a, kind: a.kind || 'handler' }),
  input: a.kind === 'read' ? [] : actionInput(manifest, { ...a, kind: a.kind || 'handler' }).map(fieldView),
})

function settingsSchema(manifest) {
  return (manifest.settings || []).map((s) => ({
    key: s.key, label: s.label || s.key, type: s.type, default: s.default, help: s.help || null,
    options: s.options || null, required: s.required === true, public: s.public === true,
    ...(s.max_length ? { max_length: s.max_length } : {}), ...(typeof s.min === 'number' ? { min: s.min } : {}), ...(typeof s.max === 'number' ? { max: s.max } : {}),
  }))
}

function settingsValues(manifest, config = {}) {
  const out = {}
  for (const s of manifest.settings || []) {
    if (Object.prototype.hasOwnProperty.call(config, s.key)) out[s.key] = config[s.key]
    else if (s.default !== undefined) out[s.key] = s.default
    else out[s.key] = null
  }
  return out
}

/** @param {object} manifest an SDK manifest */
export function descriptorFor(manifest, { installId = '5b0b2f0e-3c1d-4a4e-9a57-1d1c2f6a9e11', granted = null, config = {}, counts = {}, installed = true } = {}) {
  const m = manifest
  const perms = (m.permissions || []).map((p) => (typeof p === 'string' ? p : p.id))
  const publicSurfaces = (m.surfaces || []).filter((s) => s.kind === 'public')
  const publicResources = (m.resources || []).filter((r) => r.public && r.public !== 'none')
  const actions = (m.actions || []).map((a) => ({ ...a, kind: a.kind || 'handler' }))
  return {
    app: { id: m.id, name: m.name, summary: m.summary, description: m.description || null, icon: m.icon || null, category: m.category || null, version: m.version },
    installed: installed ? { installId, version: 1 } : null,
    permissions: { requested: perms, granted: installed ? (granted ?? perms) : [] },
    pricing: m.pricing,
    settings: { schema: settingsSchema(m), values: installed ? settingsValues(m, config) : null },
    resources: (m.resources || []).map((r) => resourceView(r, installed ? counts[r.id] ?? 0 : undefined)),
    actions: actions.map((a) => actionView(m, a)),
    events: (m.events || []).map((e) => ({ name: `${m.id}.${e.name}`, summary: e.summary })),
    surfaces: m.surfaces || [],
    public: installed && (publicSurfaces.length || publicResources.length)
      ? { path: `/api/apps/${m.id}/public/${installId}`, surfaces: publicSurfaces, resources: publicResources.map((r) => r.id) }
      : null,
  }
}

/* ── synthetic apps: nothing like feedback, so nothing in the renderer can be about feedback ── */

/** Every field type the API's manifest allows, plus the renderer's image-url. One resource. */
export const everythingManifest = {
  schema_version: 1, sdk: 1, id: 'field-garden', name: 'Field Garden', version: '2.1.0', icon: '🌱', category: 'demo',
  summary: 'A test app with one of every field type.',
  description: 'Every input the renderer knows how to draw, so a new app that uses any of them just works.',
  pricing: { model: 'free' },
  permissions: ['messages:send', 'orders:read'],
  settings: [
    { key: 'shop_name', label: 'Shop name', type: 'text', default: 'Dockside', max_length: 40, help: 'Shown on receipts.' },
    { key: 'welcome', label: 'Welcome note', type: 'textarea', max_length: 200 },
    { key: 'max_per_day', label: 'Most bookings per day', type: 'integer', default: 10, min: 1, max: 50 },
    { key: 'deposit_rate', label: 'Deposit rate', type: 'number', default: 0.25, min: 0, max: 1 },
    { key: 'accept_walkins', label: 'Accept walk-ins', type: 'boolean', default: true },
    { key: 'time_zone', label: 'Time zone', type: 'select', default: 'central', options: ['eastern', 'central', { value: 'pacific', label: 'Pacific (west coast)' }] },
  ],
  resources: [{
    id: 'plants', label: 'Plants', description: 'Everything growing in the garden.', public: 'read-append', title: 'name',
    fields: [
      { key: 'name', label: 'Name', type: 'text', required: true, max_length: 60, placeholder: 'Tomato' },
      { key: 'notes', label: 'Notes', type: 'textarea', max_length: 300, help: 'Anything worth remembering.' },
      { key: 'kind', label: 'Kind', type: 'select', required: true, default: 'herb', options: ['herb', 'fruit', { value: 'flower', label: 'Flower (for show)' }] },
      { key: 'contact', label: 'Grower email', type: 'email', max_length: 80 },
      { key: 'phone', label: 'Grower phone', type: 'phone', max_length: 30 },
      { key: 'website', label: 'Website', type: 'url' },
      { key: 'photo_url', label: 'Photo', type: 'url', help: 'A link to a picture.' },
      { key: 'count', label: 'How many', type: 'integer', required: true, min: 0, max: 500, default: 1 },
      { key: 'height_m', label: 'Height (metres)', type: 'number', min: 0, max: 30 },
      { key: 'price', label: 'Price', type: 'money', min: 0, max: 1000 },
      { key: 'in_stock', label: 'In stock', type: 'boolean', default: true },
      { key: 'planted_on', label: 'Planted on', type: 'date' },
      { key: 'harvest_at', label: 'Harvest time', type: 'timestamp' },
      { key: 'extra', label: 'Extra data', type: 'json', help: 'Advanced: JSON.' },
      { key: 'secret_note', label: 'Private note', type: 'text', ownerOnly: true },
    ],
  }],
  actions: [
    { id: 'list', kind: 'read', resource: 'plants', summary: 'List the plants.' },
    { id: 'add_plant', label: 'Add a plant', kind: 'create', resource: 'plants', summary: 'Add a plant.' },
    { id: 'rename', kind: 'update', resource: 'plants', summary: 'Change a plant.' },
    { id: 'water_report', label: 'Water report', kind: 'handler', access: 'read', summary: 'How thirsty everything is.' },
    { id: 'text_growers', label: 'Text the growers', kind: 'handler', access: 'write', summary: 'Send every grower a watering reminder.', input: [{ key: 'note', label: 'Note to add', type: 'text', max_length: 100 }] },
    { id: 'clear_dead', label: 'Clear dead plants', kind: 'handler', access: 'write', summary: 'Remove every plant marked as dead.' },
  ],
  events: [{ name: 'planted', summary: 'A plant was added.' }],
  surfaces: [{ id: 'garden', kind: 'dashboard', title: 'Garden', resource: 'plants' }, { id: 'visit', kind: 'public', title: 'Visit the garden', resource: 'plants' }],
}

/** Settings and one read action; no resources and no public link. */
export const noResourcesManifest = {
  schema_version: 1, sdk: 1, id: 'quiet-hours', name: 'Quiet Hours', version: '1.0.0', icon: '🌙',
  summary: 'Mutes automated texts overnight.',
  pricing: 'free', permissions: [],
  settings: [
    { key: 'start_hour', label: 'Quiet from (hour, 0-23)', type: 'integer', default: 21, min: 0, max: 23 },
    { key: 'end_hour', label: 'Quiet until (hour, 0-23)', type: 'integer', default: 7, min: 0, max: 23 },
    { key: 'enabled', label: 'Turn quiet hours on', type: 'boolean', default: true },
  ],
  actions: [{ id: 'status', label: 'Check status', kind: 'handler', access: 'read', summary: 'Say whether quiet hours are active right now.' }],
}

/** Actions and nothing else: no settings, no resources. */
export const actionsOnlyManifest = {
  schema_version: 1, sdk: 1, id: 'nudge', name: 'Nudge', version: '0.3.0', icon: '👋',
  summary: 'One-tap messages to your customers.',
  pricing: 'free', permissions: ['messages:send'],
  actions: [
    { id: 'thank_recent', label: 'Thank recent customers', kind: 'handler', access: 'write', summary: 'Text everyone who visited this week a thank-you.' },
    { id: 'count_recent', label: 'Count recent customers', kind: 'handler', access: 'read', summary: 'How many customers visited this week.' },
    { id: 'reset_counts', label: 'Reset the counters', kind: 'handler', access: 'write', summary: 'Delete every counter and start again.' },
  ],
}

export const syntheticManifests = { everything: everythingManifest, noResources: noResourcesManifest, actionsOnly: actionsOnlyManifest }
