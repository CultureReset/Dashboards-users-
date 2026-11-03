#!/usr/bin/env node
/**
 * Prove the SDK renderer's logic without a browser, a network or a database.
 *
 *   node scripts/check-sdkapp.mjs
 *
 * What it covers (docs/SDK-RENDERER.md says what each rule is for):
 *   - a validator for every field type, with values that pass and values that fail,
 *     and the sentence the owner is shown
 *   - forms generated from apps/feedback's real manifest (a copy lives in
 *     scripts/fixtures/sdk) and from three synthetic apps: every field type, no
 *     resources, actions only. Each form is also rendered to HTML and checked:
 *     every input has a label bound to it, errors are tied to their input
 *   - the settings schema round trip: values -> form -> PATCH body -> values
 *   - the confirm rule for actions
 *   - sort / filter / paging, permissions in words, the public link and its QR code
 *   - error classification, and that the acting-as slug rides on the SDK routes only
 *
 * The .jsx files are loaded the way vite loads them (an SSR module graph), so
 * what is rendered here is the real component, not a copy.
 */

import { createServer } from 'vite'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  FIELD_TYPES, actionBody, actionPlan, applyView, applySettingsPatch, collectForm, describePermission, errorSummary,
  explainServerErrors, explainServerMessage, filterFields, firstErrorKey, formDefaults, formFromRow, formatCell, friendlyMessage,
  humanKey, inputKind, listColumns, normalizeApp, normalizeField, pageInfo, permissionSummary, publicUrl, rowTitle,
  settingsPatch, settingsToForm, shortLabel, sortOptions, tableColumns, summarizeResult, validateField,
} from '../src/sdkapp/validate.js'
import { qrModules, qrPath, qrSize } from '../src/sdkapp/qr.js'
import { isOwnerScoped } from '../src/lib/actingScope.js'
import { tileFromManifest } from '../src/front/tiles.js'
import {
  descriptorFor, feedbackManifest, everythingManifest, noResourcesManifest, actionsOnlyManifest,
} from './fixtures/sdk/descriptor.mjs'

let failures = 0
let passes = 0
function check(label, condition, detail = '') {
  if (condition) { passes++; console.log(`  ok    ${label}`) } else {
    failures++
    console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ''}`)
  }
}
const canon = (v) => (Array.isArray(v) ? v.map(canon) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canon(v[k])])) : v)
const eq = (a, b) => JSON.stringify(canon(a)) === JSON.stringify(canon(b))

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const vite = await createServer({ root, configFile: join(root, 'vite.config.js'), server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' })
const load = (p) => vite.ssrLoadModule(p)

try {
  /* ───────────────────────────────────────────── validators, every field type ── */
  console.log('\nValidators: a good and a bad value for every field type')
  {
    const f = (type, extra = {}) => ({ key: 'x', label: 'X', type, ...extra })
    const good = (field, raw, expected) => {
      const r = validateField(field, raw)
      check(`${field.type}${field.required ? ' (required)' : ''}: ${JSON.stringify(raw)} is accepted`, r.error === null && (expected === undefined || eq(r.value, expected)), `${JSON.stringify(r)}`)
    }
    const bad = (field, raw, pattern) => {
      const r = validateField(field, raw)
      check(`${field.type}${field.required ? ' (required)' : ''}: ${JSON.stringify(raw)} is refused`, !!r.error && (!pattern || pattern.test(r.error)), JSON.stringify(r))
    }

    good(f('text'), 'hello', 'hello'); good(f('text', { max_length: 5 }), 'abcde', 'abcde')
    bad(f('text', { max_length: 5 }), 'abcdef', /5 characters or fewer \(it's 6 now\)/)
    bad(f('text', { required: true }), '   ', /fill this in/)
    good(f('text'), '', null)
    good(f('text', { pattern: '^[A-Z]{3}$' }), 'ABC'); bad(f('text', { pattern: '^[A-Z]{3}$', pattern_message: 'Use three capital letters.' }), 'abc', /three capital letters/)
    good(f('text', { pattern: '(' }), 'anything') // a broken pattern never blocks the owner
    bad(f('text', { min_length: 3 }), 'ab', /at least 3/)
    good(f('textarea', { max_length: 10 }), 'line one\nline two'.slice(0, 10)); bad(f('textarea', { max_length: 10 }), 'x'.repeat(11), /10 characters/)
    good(f('select', { options: ['a', { value: 'b', label: 'Bee' }] }), 'b', 'b'); bad(f('select', { options: ['a', 'b'] }), 'c', /one of the options/)
    bad(f('select', { required: true, options: ['a'] }), '', /choose one/i)
    good(f('email'), 'a@b.co', 'a@b.co'); bad(f('email'), 'a@b', /email address/); bad(f('email'), 'no at sign', /email address/)
    good(f('phone'), '(850) 555-0134'); good(f('phone'), '+1 850 555 0134'); bad(f('phone'), '12345', /7 digits/); bad(f('phone'), 'call me maybe', /7 digits/)
    good(f('url'), 'https://example.com/a?b=1'); bad(f('url'), 'example.com', /http/); bad(f('url'), 'ftp://example.com', /http/)
    good(f('image'), 'https://cdn.example/x.png'); bad(f('image'), 'x.png', /picture/)
    check('a url field named *_image is drawn as an image field', inputKind(f('url', { key: 'hero_image' })) === 'image' && inputKind(f('url', { key: 'website' })) === 'url')
    good(f('integer'), '3', 3); bad(f('integer'), '3.5', /whole number/); bad(f('integer'), 'three', /whole number/)
    good(f('integer', { min: 1, max: 5 }), '5', 5); bad(f('integer', { min: 1, max: 5 }), '6', /from 1 to 5/); bad(f('integer', { min: 1, max: 5 }), '0', /from 1 to 5/)
    bad(f('integer', { min: 1 }), '0', /1 or more/); bad(f('integer', { max: 9 }), '10', /9 or less/)
    good(f('number'), '12.5', 12.5); good(f('number'), '-0.5', -0.5); bad(f('number'), '1,5', /number/); bad(f('number'), 'NaN', /number/)
    good(f('money'), '$1,250.50', 1250.5); good(f('money'), '12', 12); bad(f('money'), '12.345', /dollars and cents/); bad(f('money'), 'free', /amount/)
    good(f('boolean'), true, true); good(f('boolean'), false, false); good(f('boolean', { required: true }), false, false)
    good(f('date'), '2026-02-28', '2026-02-28'); bad(f('date'), '2026-02-30', /date/); bad(f('date'), '28/02/2026', /date/); bad(f('date', { required: true }), '', /fill this in/)
    good(f('timestamp'), '2026-11-02T14:30'); bad(f('timestamp'), 'tomorrow', /date and a time/)
    check('timestamp comes out as an ISO string', /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(validateField(f('timestamp'), '2026-11-02T14:30').value))
    good(f('json'), '{"a":[1,2]}', { a: [1, 2] }); bad(f('json'), '{a:1}', /valid JSON/)
    check('every field type the API allows has a control', ['text', 'textarea', 'select', 'email', 'phone', 'url', 'number', 'integer', 'money', 'boolean', 'date', 'timestamp', 'json'].every((t) => FIELD_TYPES.includes(t) && !!inputKind({ type: t })))
    check('an unknown type is drawn as text rather than breaking', inputKind({ type: 'hologram' }) === 'text' && validateField({ key: 'k', type: 'hologram' }, 'hi').value === 'hi')
  }

  console.log('\nServer messages become sentences')
  {
    check('"must be a whole number." reads on its own', explainServerMessage('must be a whole number.') === 'This must be a whole number.')
    check('"is required." reads on its own', explainServerMessage('is required.') === 'This is required.')
    check('a full sentence is kept', explainServerMessage('Too long.') === 'Too long.')
    const mapped = explainServerErrors({ rating: 'must be at least 1.', ghost: 'is not a setting of this app.' }, [{ key: 'rating' }])
    check('known fields get their own message, strays go to the form', mapped.rating === 'This must be at least 1.' && /Ghost/.test(mapped._form))
  }

  /* ───────────────────────────────────────────────── form generation ── */
  const apps = {
    feedback: feedbackManifest,
    everything: everythingManifest,
    noResources: noResourcesManifest,
    actionsOnly: actionsOnlyManifest,
  }
  const { FormFields } = await load('/src/sdkapp/fields.jsx')

  for (const [name, manifest] of Object.entries(apps)) {
    console.log(`\nForm generation: ${name} (${manifest.id})`)
    const fromDescriptor = normalizeApp(descriptorFor(manifest))
    const fromManifest = normalizeApp(manifest, { installId: 'abc' })
    check('the descriptor and the bare manifest give the same resources', eq(fromDescriptor.resources.map((r) => [r.id, r.title, r.fields.map((x) => [x.key, x.type, x.required, x.ownerOnly])]), fromManifest.resources.map((r) => [r.id, r.title, r.fields.map((x) => [x.key, x.type, x.required, x.ownerOnly])])))
    check('and the same settings schema', eq(fromDescriptor.settings.schema.map((s) => [s.key, s.type]), fromManifest.settings.schema.map((s) => [s.key, s.type])))
    check('and the same actions', eq(fromDescriptor.actions.map((a) => [a.id, a.kind, a.access, a.input.map((i) => i.key)]), fromManifest.actions.map((a) => [a.id, a.kind, a.access, a.input.map((i) => i.key)])))

    const sets = [...fromDescriptor.resources.map((r) => [`resource ${r.id}`, r.fields]), ['settings', fromDescriptor.settings.schema], ...fromDescriptor.actions.filter((a) => a.input.length).map((a) => [`action ${a.id} input`, a.input])]
    if (!sets.some(([, fields]) => fields.length)) check('(this app has no forms)', true)
    for (const [label, fields] of sets) {
      if (!fields.length) continue
      const defaults = formDefaults(fields)
      check(`${label}: one form value per field`, eq(Object.keys(defaults), fields.map((x) => x.key)))
      const html = renderToStaticMarkup(createElement(FormFields, { fields, form: defaults, errors: {}, onChange() {}, idPrefix: 't' }))
      const ids = [...html.matchAll(/<(?:input|select|textarea)\b[^>]*\bid="([^"]+)"/g)].map((m) => m[1])
      const fors = [...html.matchAll(/<label\b[^>]*\bfor="([^"]+)"/g)].map((m) => m[1])
      check(`${label}: ${fields.length} fields drawn, each with a label bound to it`, ids.length === fields.length && ids.every((id) => fors.includes(id)), `${ids.length} inputs, ${fors.length} labels`)
      check(`${label}: no field is drawn as a bare text box by accident`, fields.every((x) => {
        const k = inputKind(x)
        const control = { textarea: '<textarea', json: '<textarea', select: '<select', checkbox: 'type="checkbox"', date: 'type="date"', datetime: 'type="datetime-local"', integer: 'type="number"', number: 'type="number"', money: 'type="number"', email: 'type="email"', tel: 'type="tel"', url: 'type="url"', image: 'type="url"' }[k]
        const part = html.slice(html.indexOf(`id="t-${x.key}"`) - 80, html.indexOf(`id="t-${x.key}"`) + 400)
        return !control || part.includes(control)
      }))
      // Break every field on purpose: the errors are tied to their inputs.
      const errors = Object.fromEntries(fields.map((x) => [x.key, 'Please fill this in.']))
      const bad = renderToStaticMarkup(createElement(FormFields, { fields, form: defaults, errors, onChange() {}, idPrefix: 't' }))
      const invalid = (bad.match(/aria-invalid="true"/g) || []).length
      const described = [...bad.matchAll(/aria-describedby="([^"]+)"/g)].filter((m) => m[1].includes('-err')).length
      check(`${label}: an error is shown under, and tied to, every field`, invalid === fields.length && described === fields.length && (bad.match(/class="sa-error"/g) || []).length === fields.length)
    }
  }

  console.log('\nFeedback specifically (the real manifest)')
  {
    const app = normalizeApp(descriptorFor(feedbackManifest))
    const entries = app.resources[0]
    check('one resource, titled by its message field', app.resources.length === 1 && entries.title === 'message')
    check('the list reads: message first, then the other fields', eq(listColumns(entries).map((x) => x.key), ['message', 'rating', 'name', 'phone', 'handled']))
    const empty = formDefaults(entries.fields)
    const r = collectForm(entries.fields, empty)
    check('an empty form is refused with the required fields named', !r.ok && eq(Object.keys(r.errors).sort(), ['message', 'rating']), JSON.stringify(r.errors))
    check('the error summary lists them in order for a screen reader', /^2 things need attention\. How was it\?: Please fill this in\. Your feedback: Please fill this in\.$/.test(errorSummary(entries.fields, r.errors)), errorSummary(entries.fields, r.errors))
    check('focus goes to the first broken field in declared order', firstErrorKey(entries.fields, r.errors) === 'rating')
    const bad = collectForm(entries.fields, { ...empty, rating: '9', message: 'Great', phone: 'abc' })
    check('a rating of 9 says 1 to 5, a bad phone says why', bad.errors.rating === 'Enter a number from 1 to 5.' && /7 digits/.test(bad.errors.phone), JSON.stringify(bad.errors))
    const ok = collectForm(entries.fields, { ...empty, rating: '5', message: ' Loved it ', name: '' })
    check('a good form sends trimmed values, leaves empty optionals out, always sends the switch', ok.ok && eq(ok.values, { rating: 5, message: 'Loved it', handled: false }), JSON.stringify(ok.values))
    const row = { id: 'r1', created_at: '2026-11-01T10:00:00Z', updated_at: '2026-11-01T10:00:00Z', rating: 4, message: 'Fine', name: 'Sam', phone: null, handled: false }
    const form = formFromRow(entries.fields, row)
    check('an edit form starts as the row', form.rating === '4' && form.message === 'Fine' && form.handled === false && form.phone === '')
    const untouched = collectForm(entries.fields, form, { mode: 'edit', row })
    check('an untouched edit sends nothing', untouched.ok && !untouched.changed && eq(untouched.values, {}))
    const changed = collectForm(entries.fields, { ...form, handled: true, name: '' }, { mode: 'edit', row })
    check('an edit sends only what changed; a cleared field is sent as null', eq(changed.values, { handled: true, name: null }), JSON.stringify(changed.values))
    check('the owner sees the ownerOnly field (handled) in the form', app.resources[0].fields.find((x) => x.key === 'handled').ownerOnly === true && Object.keys(form).includes('handled'))
    check('a row title is its message, long ones are cut', rowTitle(entries, row) === 'Fine' && rowTitle(entries, { message: 'x'.repeat(200) }).length === 80 && rowTitle(entries, {}) === 'Untitled entry')
  }

  console.log('\nThe synthetic app with every field type')
  {
    const app = normalizeApp(descriptorFor(everythingManifest))
    const res = app.resources[0]
    const types = new Set(res.fields.map((x) => x.type))
    check('it really has all thirteen API types', ['text', 'textarea', 'select', 'email', 'phone', 'url', 'number', 'integer', 'money', 'boolean', 'date', 'timestamp', 'json'].every((t) => types.has(t)))
    const d = formDefaults(res.fields)
    check('defaults come from the manifest (kind=herb, count=1, in_stock=true)', d.kind === 'herb' && d.count === '1' && d.in_stock === true && d.name === '')
    const r = collectForm(res.fields, { ...d, name: 'Basil', planted_on: '2026-05-01', harvest_at: '2026-09-01T08:00', price: '4.50', extra: '{"k":1}', height_m: '0.4' })
    check('a filled form passes and is typed', r.ok && r.values.price === 4.5 && r.values.count === 1 && r.values.extra.k === 1 && r.values.planted_on === '2026-05-01' && /Z$/.test(r.values.harvest_at), JSON.stringify(r.errors))
    const worst = collectForm(res.fields, { ...d, name: '', kind: 'weed', contact: 'x', phone: '1', website: 'x', photo_url: 'x', count: '501', height_m: '99', price: '-1', planted_on: 'x', harvest_at: 'x', extra: '{' })
    check('a form wrong in every way names every field', eq(Object.keys(worst.errors).sort(), ['contact', 'count', 'extra', 'harvest_at', 'height_m', 'kind', 'name', 'phone', 'photo_url', 'planted_on', 'price', 'website'].sort()), Object.keys(worst.errors).join())
    check('select options may be strings or {value,label}', eq(normalizeField(res.fields.find((x) => x.key === 'kind')).options.map((o) => o.label), ['Herb', 'Fruit', 'Flower (for show)']))
    check('the desktop table keeps the title and three compact columns, the rest are in Edit', eq(tableColumns(res).map((x) => x.key), ['name', 'kind', 'count', 'height_m']) && tableColumns(res, 2).length === 2 && eq(tableColumns({ fields: [] }), []))
    check('headings drop (optional)', shortLabel('Your name (optional)') === 'Your name' && shortLabel('How was it?') === 'How was it?')
    check('sorting offers every column and "Newest first"', sortOptions(res)[0].key === '_created' && sortOptions(res).length === 1 + listColumns(res).length && !sortOptions(res).some((o) => o.key === 'extra'))
    check('select and yes/no fields get filters', eq(filterFields(res).map((x) => x.key), ['kind', 'in_stock']))
    check('cells read naturally', formatCell({ type: 'boolean' }, true) === 'Yes' && formatCell({ type: 'money' }, 4.5) === '$4.50' && formatCell({ type: 'select', options: ['a'] }, 'a') === 'A' && formatCell({ type: 'text' }, null) === '—' && formatCell({ type: 'date' }, '2026-05-01').includes('2026'))
  }

  console.log('\nLists: sort, filter, search, pages')
  {
    const res = normalizeApp(descriptorFor(everythingManifest)).resources[0]
    const rows = [
      { id: 1, name: 'Basil', kind: 'herb', count: 10, in_stock: true, notes: 'sweet' },
      { id: 2, name: 'Rose', kind: 'flower', count: 2, in_stock: false, notes: null },
      { id: 3, name: 'apple', kind: 'fruit', count: 100, in_stock: true, notes: 'crisp' },
      { id: 4, name: 'Mint', kind: 'herb', count: null, in_stock: true },
    ]
    const ids = (v) => applyView(rows, res, v).map((r) => r.id).join()
    check('newest first is the order the API gave', ids({}) === '1,2,3,4')
    check('oldest first reverses it', ids({ dir: 'asc' }) === '4,3,2,1')
    check('text sorts ignore case', ids({ sortKey: 'name', dir: 'asc' }) === '3,1,4,2')
    check('numbers sort as numbers, blanks last either way', ids({ sortKey: 'count', dir: 'asc' }) === '2,1,3,4' && ids({ sortKey: 'count', dir: 'desc' }) === '3,1,2,4')
    check('a select filter', ids({ filters: { kind: 'herb' } }) === '1,4')
    check('a yes/no filter', ids({ filters: { in_stock: 'false' } }) === '2' && ids({ filters: { in_stock: 'true' } }) === '1,3,4')
    check('filters combine; empty means all', ids({ filters: { kind: 'herb', in_stock: 'true' } }) === '1,4' && ids({ filters: { kind: '' } }) === '1,2,3,4')
    check('search looks in text fields only', ids({ query: 'CRISP' }) === '3' && ids({ query: '100' }) === '')
    const p = pageInfo({ total: 140, limit: 50, offset: 50, count: 50 })
    check('page 2 of 3: 51 to 100, previous at 0, next at 100', p.from === 51 && p.to === 100 && p.page === 2 && p.pages === 3 && p.prevOffset === 0 && p.nextOffset === 100 && p.hasPrev && p.hasNext && p.partial)
    check('a single short page has no previous or next', (() => { const q = pageInfo({ total: 3, limit: 50, offset: 0, count: 3 }); return !q.hasPrev && !q.hasNext && !q.partial && q.from === 1 && q.to === 3 })())
    check('an empty list says 0', pageInfo({ total: 0, limit: 50, offset: 0, count: 0 }).from === 0)
  }

  /* ───────────────────────────────────────────── settings round trip ── */
  console.log('\nSettings: schema -> form -> PATCH body -> values')
  for (const [name, manifest] of Object.entries(apps)) {
    const app = normalizeApp(descriptorFor(manifest, { config: {} }))
    const schema = app.settings.schema
    if (!schema.length) { check(`${name}: no settings, nothing to save`, app.settings.values !== undefined); continue }
    const values = app.settings.values
    const form = settingsToForm(schema, values)
    const untouched = settingsPatch(schema, form, values)
    check(`${name}: the untouched form sends nothing`, untouched.ok && !untouched.changed && eq(untouched.values, {}), JSON.stringify(untouched))
    // change every setting to a different valid value
    const next = { ...form }
    for (const s of schema) {
      const k = inputKind(s)
      next[s.key] = k === 'checkbox' ? !form[s.key] : k === 'integer' ? String(Math.min(s.max ?? 99, Math.max(s.min ?? 0, Number(form[s.key] || 0) + 1))) : k === 'number' ? String((Number(form[s.key] || 0) + 0.5).toFixed(2)).replace(/0+$/, '') : k === 'select' ? s.options.find((o) => o.value !== form[s.key]).value : `${form[s.key] || 'Note'} changed`
    }
    const patch = settingsPatch(schema, next, values)
    check(`${name}: changing every setting sends exactly those keys`, patch.ok && eq(Object.keys(patch.values).sort(), schema.map((s) => s.key).sort()), JSON.stringify(patch.errors))
    const after = applySettingsPatch(values, patch.values)
    const back = settingsToForm(schema, after)
    check(`${name}: the saved values come back as the same form`, eq(back, next), `${JSON.stringify(back)} vs ${JSON.stringify(next)}`)
    const one = settingsPatch(schema, { ...form, [schema[0].key]: next[schema[0].key] }, values)
    check(`${name}: changing one setting sends only that one`, eq(Object.keys(one.values), [schema[0].key]))
  }
  {
    const fb = normalizeApp(descriptorFor(feedbackManifest))
    const form = settingsToForm(fb.settings.schema, fb.settings.values)
    check('feedback: the thank-you message and the text switch prefill from the descriptor', form.thank_you_message.startsWith('Thank you!') && form.notify_by_text === false)
    const over = settingsPatch(fb.settings.schema, { ...form, thank_you_message: 'x'.repeat(301) }, fb.settings.values)
    check('feedback: a 301-character thank-you is refused in plain words', !over.ok && /300 characters or fewer/.test(over.errors.thank_you_message))
    const cleared = settingsPatch(fb.settings.schema, { ...form, thank_you_message: '' }, fb.settings.values)
    check('feedback: clearing a message is sent as null (the API treats "" as null too)', cleared.ok && eq(cleared.values, { thank_you_message: null }))
    const eve = normalizeApp(descriptorFor(everythingManifest))
    const bound = settingsPatch(eve.settings.schema, { ...settingsToForm(eve.settings.schema, eve.settings.values), max_per_day: '99', deposit_rate: '2' }, eve.settings.values)
    check('min and max apply to settings too', /from 1 to 50/.test(bound.errors.max_per_day) && /from 0 to 1/.test(bound.errors.deposit_rate))
  }

  /* ───────────────────────────────────────────────── action confirm rule ── */
  console.log('\nActions: the confirm rule')
  {
    const fb = normalizeApp(descriptorFor(feedbackManifest))
    const byId = (app, id) => app.actions.find((a) => a.id === id)
    const list = actionPlan(byId(fb, 'list'), fb)
    check('feedback list: a read, runs at once, no confirm', list.mode === 'run' && !list.confirm.needed)
    const summary = actionPlan(byId(fb, 'summary'), fb)
    check('feedback summary: a read handler, no confirm', summary.mode === 'run' && !summary.confirm.needed && !summary.needsInput)
    const update = actionPlan(byId(fb, 'update'), fb)
    check('feedback update: no button, it is the Edit button on each row', update.mode === 'info' && update.resource === 'entries')

    const eve = normalizeApp(descriptorFor(everythingManifest))
    const text = actionPlan(byId(eve, 'text_growers'), eve)
    check('a write that can send messages is confirmed, says it may text customers, and asks for its input', text.confirm.needed && text.confirm.sends && /may send text messages or emails to your customers/.test(text.confirm.message) && text.needsInput && !text.confirm.danger, JSON.stringify(text.confirm))
    check('the confirm names the action and repeats what it does', /Text the growers\?/.test(text.confirm.title) && text.confirm.message.includes('Send every grower a watering reminder.') && text.confirm.confirmLabel === 'Text the growers')
    const clear = actionPlan(byId(eve, 'clear_dead'), eve)
    check('a destructive action is confirmed as dangerous and says it cannot be undone', clear.confirm.needed && clear.confirm.danger && /can't be undone/.test(clear.confirm.message) && /^Are you sure\?/.test(clear.confirm.title), JSON.stringify(clear.confirm))
    check('a read handler is not confirmed', !actionPlan(byId(eve, 'water_report'), eve).confirm.needed)
    const add = actionPlan(byId(eve, 'add_plant'), eve)
    check('a create action opens the resource\'s Add form', add.mode === 'add' && add.resource === 'plants')
    check('a create action finds its resource even though the descriptor does not name it', byId(eve, 'add_plant').resource === 'plants' && byId(normalizeApp(everythingManifest, { installId: 'x' }), 'add_plant').resource === 'plants')

    const nudge = normalizeApp(descriptorFor(actionsOnlyManifest))
    check('actions-only app: thank_recent is confirmed and may text', actionPlan(byId(nudge, 'thank_recent'), nudge).confirm.sends)
    check('actions-only app: reset_counts is dangerous', actionPlan(byId(nudge, 'reset_counts'), nudge).confirm.danger)
    check('actions-only app: count_recent is a plain read', !actionPlan(byId(nudge, 'count_recent'), nudge).confirm.needed)
    const notAllowed = normalizeApp(descriptorFor(actionsOnlyManifest, { granted: [] }))
    const quiet = actionPlan(byId(notAllowed, 'thank_recent'), notAllowed)
    check('if the owner never allowed messages, it does not claim it will send, but it still asks', quiet.confirm.needed && !quiet.confirm.sends && !/send text/.test(quiet.confirm.message))
    const qh = normalizeApp(descriptorFor(noResourcesManifest))
    check('quiet-hours: its only action is a read and runs at once', !actionPlan(byId(qh, 'status'), qh).confirm.needed)
    check('the action body takes only declared input and checks it', (() => {
      const a = byId(eve, 'text_growers')
      return actionBody(a, { note: 'Bring water' }).ok && eq(actionBody(a, { note: 'Bring water' }).values, { note: 'Bring water' }) && !actionBody(a, { note: 'x'.repeat(101) }).ok
    })())
    check('results are put in words', summarizeResult({ total: 12, average_rating: 4.3333, unhandled: 3 }).items.map((i) => `${i.label}=${i.value}`).join() === 'Total=12,Average rating=4.33,Unhandled=3' && summarizeResult({ rows: [], total: 0 }).headline === 'Found 0 entries.' && summarizeResult({ ok: true }).headline === 'Done.' && summarizeResult(undefined).headline === 'Done.' && summarizeResult({ message: 'Sent 4.' }).headline === 'Sent 4.')
  }

  /* ────────────────────────────────────────── permissions, public link, QR ── */
  console.log('\nPermissions in plain words')
  {
    const fb = normalizeApp(descriptorFor(feedbackManifest))
    const s = permissionSummary(fb)
    check('feedback: reads and writes its own list', s.reads.includes('Its own feedback list') && s.writes.includes('Adds and changes entries in its feedback list'))
    check('feedback: sends messages, and customers add through the link but only the owner reads', s.sends[0].startsWith('Send text messages') && s.visitors.some((v) => /add to feedback through your public link; only you can read it/.test(v)))
    check('feedback: messages:send is shown as allowed', s.asked[0].granted === true && /text messages and emails/.test(s.asked[0].text))
    const off = permissionSummary(normalizeApp(descriptorFor(feedbackManifest, { granted: [] })))
    check('a permission the owner did not allow says so', off.asked[0].granted === false)
    const bare = permissionSummary(normalizeApp(feedbackManifest, { installId: 'x' }))
    check('from a bare manifest it is "asked for", never "allowed"', bare.asked[0].granted === null)
    check('permission ids are put in words', describePermission('orders:read') === 'Read your orders' && describePermission('menu:write') === 'Change your menu' && describePermission('connections:read').includes('never your passwords') && describePermission('custom_thing') === 'Custom thing')
    const none = permissionSummary(normalizeApp(descriptorFor(noResourcesManifest)))
    check('an app that asks for nothing says it keeps what it needs (its settings) and sends nothing', none.sends.length === 0 && none.asked.length === 0 && none.writes.includes('Keeps the settings you choose below'))
  }

  console.log('\nPublic link and QR code')
  {
    const fb = normalizeApp(descriptorFor(feedbackManifest))
    const url = publicUrl('https://api.example.test/', fb)
    check('the link is <API origin><public.path>, one slash between', url === 'https://api.example.test/api/apps/feedback/public/5b0b2f0e-3c1d-4a4e-9a57-1d1c2f6a9e11', url)
    check('the link has no business slug in it', !/entity|slug|harbor/.test(url))
    check('apps without a public surface have no link', publicUrl('https://x', normalizeApp(descriptorFor(noResourcesManifest))) === null && publicUrl('https://x', normalizeApp(descriptorFor(actionsOnlyManifest))) === null)
    check('a bare manifest + install id gives the same path as the API', normalizeApp(feedbackManifest, { installId: '5b0b2f0e-3c1d-4a4e-9a57-1d1c2f6a9e11' }).public.path === fb.public.path)
    check('a public resource with no public surface still gets a link (read-append)', normalizeApp(descriptorFor({ ...everythingManifest, surfaces: [] })).public !== null)
    const m = qrModules(url)
    const n = m.length
    check('the QR code is a square of 17+4v modules', (n - 17) % 4 === 0 && n >= 21 && m.every((row) => row.length === n), `${n}`)
    const finderOk = (r0, c0) => {
      for (let r = 0; r < 7; r++) for (let c = 0; c < 7; c++) {
        const ring = Math.max(Math.abs(r - 3), Math.abs(c - 3))
        if (m[r0 + r][c0 + c] !== (ring !== 2)) return false
      }
      return true
    }
    check('three finder patterns, in the right corners', finderOk(0, 0) && finderOk(0, n - 7) && finderOk(n - 7, 0))
    check('timing pattern alternates and the fixed dark module is set', Array.from({ length: n - 16 }, (_, i) => m[6][8 + i] === ((8 + i) % 2 === 0)).every(Boolean) && m[n - 8][8] === true)
    check('the same text always draws the same code; different text a different one', eq(qrModules(url), m) && !eq(qrModules(`${url}x`), m))
    check('the path is drawn only with dark modules and a quiet zone', qrPath(m).startsWith('M4 4') && qrSize(m) === n + 8)
    const longest = `https://gcr-api-clean.vercel.app/api/apps/${'a'.repeat(40)}/public/5b0b2f0e-3c1d-4a4e-9a57-1d1c2f6a9e11`
    check(`a short text fits version 1 (21x21); the longest possible public link (${longest.length} bytes) still fits`, qrModules('hi').length === 21 && qrModules(longest) !== null)
    check('text too long for the largest supported version returns null (the link is shown without a code)', qrModules('a'.repeat(300)) === null)
    check('non-ASCII text is encoded as UTF-8 bytes', qrModules('café ☕') !== null)
    // Optional: compare module for module with an independent encoder when one is installed.
    let reference = null
    try {
      const { createRequire } = await import('node:module')
      const req = createRequire(import.meta.url)
      const QR = req('qrcode-terminal/vendor/QRCode'); const ECL = req('qrcode-terminal/vendor/QRCode/QRErrorCorrectLevel')
      reference = { QR, ECL }
    } catch { /* not installed here: the structural checks above still run */ }
    if (reference) {
      const text = 'https://example.test/api/apps/feedback/public/5b0b2f0e-3c1d-4a4e-9a57-1d1c2f6a9e11'
      const mine = qrModules(text)
      const q = new reference.QR((mine.length - 17) / 4, reference.ECL.M); q.addData(text); q.make()
      const masks = Array.from({ length: 8 }, (_, k) => qrModules(text, { mask: k }))
      check('matches an independent encoder module for module (under one of the eight masks)', masks.some((mm) => mm.every((row, r) => row.every((v, c) => v === q.isDark(r, c)))))
    }
  }

  /* ──────────────────────────────────────────────────────────── API layer ── */
  console.log('\nErrors and the acting-as slug')
  {
    const { classifyError } = await load('/src/sdkapp/api.js')
    const E = (status, body) => ({ status, body })
    check('no answer is offline', classifyError(E(0, null)).kind === 'offline')
    check('503 not_configured is the unapplied records table', classifyError(E(503, { code: 'not_configured', error: 'Apps are not set up on this database yet (apply sql/...)' })).kind === 'not_configured')
    check('a plain 503 is just a server problem', classifyError(E(503, { error: 'x' })).kind === 'server')
    check('409 not_installed is an uninstall mid-session', classifyError(E(409, { code: 'not_installed' })).kind === 'not_installed')
    check('403 is not entitled', classifyError(E(403, { error: 'no' })).kind === 'forbidden')
    check('401 is signed out', classifyError(E(401, {})).kind === 'signed_out')
    check('404 is not found (a non-SDK app, or a row already gone)', classifyError(E(404, {})).kind === 'not_found')
    const inv = classifyError(E(422, { error: 'Some fields need attention.', errors: { rating: 'is required.' } }))
    check('422 carries the per-field errors', inv.kind === 'invalid' && inv.errors.rating === 'is required.')
    check('the words for each never leak the technical detail', !/sql|apply|database/i.test(friendlyMessage('not_configured', 'Apps are not set up on this database yet (apply sql/2026-11-02-app-sdk.sql)')) && /offline/.test(friendlyMessage('offline')) && /removed/.test(friendlyMessage('not_installed')))
    check('the SDK owner routes carry the acting slug', ['/api/apps', '/api/apps/feedback', '/api/apps/feedback/settings', '/api/apps/feedback/resources/entries', '/api/apps/feedback/resources/entries/9', '/api/apps/feedback/actions/summary'].every(isOwnerScoped))
    check('the public link and the two older route apps do not', !isOwnerScoped('/api/apps/feedback/public/abc') && !isOwnerScoped('/api/apps/song-request/harbor-grill') && !isOwnerScoped('/api/apps/merch-store/harbor-grill/orders'))
    check('the existing owner scopes are unchanged', isOwnerScoped('/api/store') && isOwnerScoped('/api/business/me') && !isOwnerScoped('/api/storefront') && !isOwnerScoped('/api/business-auth/password'))
    const { default: endpoints } = await load('/src/lib/endpoints.js')
    const e = endpoints.sdkApps
    check('the endpoint registry builds the contract\'s paths and encodes every segment', e.list() === '/api/apps' && e.app('feedback') === '/api/apps/feedback' && e.settings('feedback') === '/api/apps/feedback/settings' && e.rows('feedback', 'entries') === '/api/apps/feedback/resources/entries' && e.row('feedback', 'entries', 'a/b') === '/api/apps/feedback/resources/entries/a%2Fb' && e.action('feedback', 'summary') === '/api/apps/feedback/actions/summary')
    check('no function in the registry takes a business slug', Object.values(e).every((fn) => !/slug/i.test(fn.toString())))
  }

  console.log('\nLauncher wiring')
  {
    check('an installed SDK app opens the renderer by its key', eq(tileFromManifest(null, { id: 'uuid-1', key: 'feedback', kind: 'app', name: 'Feedback', installed: { status: 'enabled' } }).target, { view: 'sdk', appKey: 'feedback' }))
    check('a switched-off app opens its Store entry', tileFromManifest(null, { id: 'u', key: 'feedback', kind: 'app', installed: { status: 'disabled' } }).target.view === 'store')
    check('a module, or a row with no key, still opens the Store', tileFromManifest(null, { id: 'u', key: 'gallery', kind: 'module', installed: {} }).target.view === 'store' && tileFromManifest(null, { id: 'u', installed: {} }).target.view === 'store')
    check('an older Store response with no kind is still tried as an SDK app', tileFromManifest(null, { id: 'u', key: 'feedback', installed: {} }).target.view === 'sdk')
  }
} finally {
  await vite.close()
}

console.log(`\n${passes} passed, ${failures} failed`)
process.exit(failures ? 1 : 0)
