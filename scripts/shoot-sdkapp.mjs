#!/usr/bin/env node
// Screenshots of the SDK renderer against a STUB API. No live service is called:
// every request to the API host is fulfilled here and anything unknown is a 404.
//
//   npm run build && npx vite preview --port 4173 &
//   node scripts/shoot-sdkapp.mjs [outDir]
//
// Needs playwright (not a dependency of this repo): it is required from the
// global install, and its preinstalled chromium is used.
//
// The stub serves apps/feedback's real manifest and the synthetic apps in
// scripts/fixtures/sdk/descriptor.mjs, through the same descriptor shape the
// API builds, and enforces a few of the API's own validation messages so the
// 422 path is drawn for real.

import { createRequire } from 'node:module'
import { mkdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import {
  descriptorFor, feedbackManifest, everythingManifest, noResourcesManifest, actionsOnlyManifest,
} from './fixtures/sdk/descriptor.mjs'

const { chromium } = createRequire(import.meta.url)('playwright')
const OUT = resolve(process.argv[2] || 'out')
mkdirSync(OUT, { recursive: true })
const BASE = process.env.SHOOT_BASE || 'http://127.0.0.1:4173/'
const API = 'https://gcr-api-clean.vercel.app'

const manifests = { feedback: feedbackManifest, 'field-garden': everythingManifest, 'quiet-hours': noResourcesManifest, nudge: actionsOnlyManifest }
const item = (m, i) => ({ id: `st-${m.id}`, key: m.id, kind: 'app', name: m.name, icon: m.icon, summary: m.summary, entitled: true, reason: 'free', available: { semver: m.version, permissions: [] }, update_available: false, new_permissions: [], installed: { status: 'enabled', semver: m.version, settings: [], config: {} }, order: i })

const when = (d) => new Date(Date.now() - d * 86400000).toISOString()
const seed = () => ({
  feedback: {
    entries: [
      { id: 'e5', created_at: when(0.2), updated_at: when(0.2), rating: 5, message: 'Best fish tacos on the coast. The staff remembered our names on the second visit.', name: 'Dana R.', phone: '(850) 555-0134', handled: false },
      { id: 'e4', created_at: when(1), updated_at: when(1), rating: 4, message: 'Great sunset view from the deck. Parking was tight on Saturday.', name: null, phone: null, handled: true },
      { id: 'e3', created_at: when(3), updated_at: when(3), rating: 2, message: 'Waited forty minutes for a table even with a reservation.', name: 'Luis M.', phone: '(251) 555-0188', handled: false },
      { id: 'e2', created_at: when(6), updated_at: when(6), rating: 5, message: 'Kids loved the shrimp basket.', name: 'Ann', phone: null, handled: true },
      { id: 'e1', created_at: when(9), updated_at: when(9), rating: 3, message: 'Fine. A little loud.', name: null, phone: null, handled: false },
    ],
  },
  'field-garden': {
    plants: [
      { id: 'p3', created_at: when(1), updated_at: when(1), name: 'Basil', kind: 'herb', count: 12, price: 4.5, in_stock: true, planted_on: '2026-05-01', notes: 'Near the window.' },
      { id: 'p2', created_at: when(2), updated_at: when(2), name: 'Hibiscus', kind: 'flower', count: 3, price: 18, in_stock: false, planted_on: '2026-03-14' },
      { id: 'p1', created_at: when(5), updated_at: when(5), name: 'Fig', kind: 'fruit', count: 1, price: 32.25, in_stock: true },
    ],
  },
})

// A few of the API's own validation messages (lib/businessTables.js coerceColumn + manifest.checkValue).
function serverCheck(fields, body, partial) {
  const errors = {}
  for (const f of fields) {
    if (partial && !(f.key in body)) continue
    let v = body[f.key]
    if (v === '' || v === undefined) v = null
    if (v === null) { if (f.required && !partial) errors[f.key] = 'is required.'; else if (f.required && partial) errors[f.key] = 'is required.'; continue }
    if (['integer', 'number', 'money'].includes(f.type)) {
      const n = Number(v)
      if (!Number.isFinite(n) || (f.type === 'integer' && !Number.isInteger(n))) errors[f.key] = f.type === 'integer' ? 'must be a whole number.' : 'must be a number.'
      else if (typeof f.min === 'number' && n < f.min) errors[f.key] = `must be at least ${f.min}.`
      else if (typeof f.max === 'number' && n > f.max) errors[f.key] = `must be at most ${f.max}.`
    } else if (typeof v === 'string' && f.max_length && v.length > f.max_length) errors[f.key] = `must be at most ${f.max_length} characters.`
  }
  return errors
}

function makeStub(scenario) {
  const data = seed()
  const config = { feedback: {} }
  const installed = new Set(scenario.installed || Object.keys(manifests))
  const entity = { slug: 'harbor-grill', name: 'Harbor Grill', entity_type: 'restaurant' }
  return (route) => {
    const req = route.request()
    const url = new URL(req.url())
    const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' }
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors })
    const json = (body, status = 200) => route.fulfill({ status, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify(body) })
    const p = url.pathname
    const body = (() => { try { return JSON.parse(req.postData() || '{}') } catch { return {} } })()
    if (p === '/api/business/me') return json({ slug: entity.slug, name: entity.name, isAdmin: false, hasAccess: true, role: 'owner', slugs: [{ slug: entity.slug, name: entity.name, role: 'owner' }] })
    if (p.startsWith('/api/gcr/entity/')) return json(entity)
    if (p === '/api/business/schema') return json({ tables: [], columns: {} })
    if (p === '/api/business/sections') return json({ sections: {} })
    if (p === '/api/owner/modules') return json({ modules: [], owner_visible_tables: [] })
    if (p === '/api/store') return json({ items: [...installed].map((id, i) => item(manifests[id], i)) })
    if (p === '/api/business/automations') return json({ automations: [] })
    if (p === '/api/business/ical') return json({ units: [] })
    if (p === '/api/connections') return json({ tools: [], categories: [], composio_configured: true })

    // ── the App SDK owner routes ───────────────────────────────────────
    if (p === '/api/apps') return json({ apps: [...installed].map((id) => ({ id, name: manifests[id].name, summary: manifests[id].summary, icon: manifests[id].icon, version: 1, hasSettings: !!manifests[id].settings?.length, resources: (manifests[id].resources || []).map((r) => r.id) })) })
    const m = /^\/api\/apps\/([^/]+)(?:\/(settings|resources|actions)(?:\/([^/]+))?(?:\/([^/]+))?)?$/.exec(p)
    if (m && manifests[m[1]]) {
      const [, id, kind, a, b] = m
      const manifest = manifests[id]
      if (scenario.notConfigured && kind === undefined) return json({ error: 'Apps are not set up on this database yet (apply sql/2026-11-02-app-sdk.sql, see docs/APP-SDK.md).', code: 'not_configured' }, 503)
      if (scenario.gone === id && kind !== undefined) return json({ error: 'Install this app first.', code: 'not_installed' }, 409)
      if (!kind) {
        const counts = Object.fromEntries((manifest.resources || []).map((r) => [r.id, (data[id]?.[r.id] || []).length]))
        return json(descriptorFor(manifest, { config: config[id] || {}, counts }))
      }
      if (kind === 'settings' && req.method() === 'PATCH') {
        const schema = manifest.settings || []
        const errors = serverCheck(schema, body.settings || {}, true)
        if (Object.keys(errors).length) return json({ error: 'Some settings need attention.', errors }, 422)
        config[id] = { ...(config[id] || {}), ...body.settings }
        return json({ settings: Object.fromEntries(schema.map((s) => [s.key, config[id][s.key] ?? s.default ?? null])) })
      }
      if (kind === 'resources') {
        const res = (manifest.resources || []).find((r) => r.id === a)
        if (!res) return json({ error: 'No such resource' }, 404)
        const rows = (data[id] ||= {})[a] ||= []
        if (req.method() === 'GET') {
          if (scenario.listFails === id) return json({ error: 'Apps are not set up on this database yet.', code: 'not_configured' }, 503)
          const limit = Number(url.searchParams.get('limit')) || 50
          const offset = Number(url.searchParams.get('offset')) || 0
          return json({ resource: a, rows: rows.slice(offset, offset + limit), total: rows.length, limit, offset })
        }
        if (req.method() === 'POST') {
          const errors = serverCheck(res.fields, body, false)
          if (Object.keys(errors).length) return json({ error: 'Some fields need attention.', errors }, 422)
          const row = { id: `n${rows.length + 1}`, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), ...body }
          rows.unshift(row)
          return json({ resource: a, row }, 201)
        }
        if (req.method() === 'PATCH') {
          const row = rows.find((r) => r.id === b)
          Object.assign(row, body)
          return json({ resource: a, row })
        }
        if (req.method() === 'DELETE') {
          const i = rows.findIndex((r) => r.id === b)
          if (i >= 0) rows.splice(i, 1)
          return json({ resource: a, deleted: b })
        }
      }
      if (kind === 'actions' && req.method() === 'POST') {
        if (a === 'summary') return json({ action: a, result: { total: data.feedback.entries.length, average_rating: 3.8, not_handled: data.feedback.entries.filter((e) => !e.handled).length } })
        if (a === 'thank_recent') return json({ action: a, result: { sent: 4, skipped_opted_out: 1 } })
        return json({ action: a, result: { ok: true } })
      }
    }
    return json({ error: 'stub: not found' }, 404)
  }
}

async function open(browser, scenario, { width, height, dark = false }) {
  const ctx = await browser.newContext({ viewport: { width, height }, colorScheme: dark ? 'dark' : 'light', deviceScaleFactor: 2, hasTouch: width < 600, isMobile: width < 600 })
  await ctx.addInitScript(() => {
    localStorage.setItem('gcr_business_session_v1', JSON.stringify({ access_token: 'stub-not-a-real-token', expires_at: 4102444800, user: { email: 'owner@example.test' } }))
  })
  await ctx.route(`${API}/**`, makeStub(scenario))
  const page = await ctx.newPage()
  page.on('pageerror', (e) => console.log('  pageerror', e.message))
  await page.goto(BASE)
  await page.waitForSelector('.fl-grid', { timeout: 15000 })
  return { ctx, page }
}

const sizes = { phone: { width: 390, height: 844 }, desktop: { width: 1280, height: 860 } }

async function shot(page, name, size, { full = false, clip } = {}) {
  await page.waitForTimeout(300)
  const file = join(OUT, `sdkapp-${name}-${size}.png`)
  await page.screenshot({ path: file, fullPage: full, ...(clip ? { clip } : {}) })
  console.log('  wrote', file)
}

async function openTile(page, name) {
  await page.getByRole('button', { name: new RegExp(`^${name}`) }).click()
  await page.waitForSelector('.sdkapp, .sa-problem', { timeout: 10000 })
}

const browser = await chromium.launch()
try {
  for (const [size, dim] of Object.entries(sizes)) {
    // 1. resource list, 2. the launcher with the SDK tiles
    {
      const { ctx, page } = await open(browser, {}, dim)
      await shot(page, 'launcher', size)
      await openTile(page, 'Feedback')
      await page.waitForSelector('[data-resource="entries"] .sa-rowcard, [data-resource="entries"] .sa-table')
      await shot(page, 'list', size)
      await page.locator('#sa-public').scrollIntoViewIfNeeded()
      await shot(page, 'public-link', size)

      // 3. add form with validation errors
      await page.locator('[data-resource="entries"]').getByRole('button', { name: /^Add to / }).click()
      await page.waitForSelector('.sa-sheet form')
      await page.locator('.sa-sheet').getByRole('button', { name: 'Add', exact: true }).click()
      await page.waitForSelector('.sa-error')
      await shot(page, 'add-form-errors', size)
      await page.locator('.sa-sheet').getByRole('button', { name: 'Cancel' }).click()

      // 4. settings
      await page.locator('#sa-settings').scrollIntoViewIfNeeded()
      await page.getByLabel('Thank-you message').fill('Thanks so much for telling us. We read every one.')
      await page.waitForTimeout(100)
      await shot(page, 'settings', size)
      await page.getByRole('button', { name: 'Save settings' }).click()
      await page.waitForSelector('.toast')
      await shot(page, 'settings-saved', size)

      // permissions
      await page.locator('#sa-permissions').scrollIntoViewIfNeeded()
      await shot(page, 'permissions', size)
      await ctx.close()
    }

    // 5. action confirm that names what will happen (sends messages)
    {
      const { ctx, page } = await open(browser, {}, dim)
      await openTile(page, 'Nudge')
      await page.getByRole('button', { name: 'Thank recent customers' }).click()
      await page.waitForSelector('.confirm-sheet')
      await shot(page, 'action-confirm', size)
      await page.getByRole('button', { name: 'Thank recent customers' }).last().click()
      await page.waitForSelector('.sa-result')
      await shot(page, 'action-result', size)
      await page.getByRole('button', { name: 'Reset the counters' }).click()
      await page.waitForSelector('.confirm-sheet')
      await shot(page, 'action-confirm-danger', size)
      await ctx.close()
    }

    // 6. the 503 state
    {
      const { ctx, page } = await open(browser, { notConfigured: true }, dim)
      await openTile(page, 'Feedback')
      await shot(page, 'not-configured', size)
      await ctx.close()
    }

    // 7. an app with every field type
    {
      const { ctx, page } = await open(browser, {}, dim)
      await openTile(page, 'Field Garden')
      await shot(page, 'garden-list', size)
      await page.locator('[data-resource="plants"]').getByRole('button', { name: /^Add to / }).click()
      await page.waitForSelector('.sa-sheet form')
      await page.locator('.sa-sheet').getByLabel('Name').fill('Mint')
      await page.locator('.sa-sheet').getByLabel('Grower email').fill('not-an-email')
      await page.locator('.sa-sheet').getByLabel('How many').fill('900')
      await page.locator('.sa-sheet').getByLabel('Extra data').fill('{oops')
      await page.locator('.sa-sheet').getByRole('button', { name: 'Add', exact: true }).click()
      await page.waitForSelector('.sa-error')
      await shot(page, 'garden-form-errors', size)
      await ctx.close()
    }
  }

  // 8. dark, phone; offline-ish and uninstalled-mid-session states, phone
  {
    const { ctx, page } = await open(browser, {}, { ...sizes.phone }, true)
    await ctx.close()
  }
  {
    const { ctx, page } = await open(browser, {}, sizes.phone)
    await ctx.close()
  }
  {
    const ctx = await browser.newContext({ viewport: sizes.phone, colorScheme: 'dark', deviceScaleFactor: 2, hasTouch: true, isMobile: true })
    await ctx.addInitScript(() => { localStorage.setItem('gcr_business_session_v1', JSON.stringify({ access_token: 'stub-not-a-real-token', expires_at: 4102444800, user: { email: 'owner@example.test' } })) })
    await ctx.route(`${API}/**`, makeStub({}))
    const page = await ctx.newPage()
    await page.goto(BASE)
    await page.waitForSelector('.fl-grid')
    await openTile(page, 'Feedback')
    await page.waitForSelector('[data-resource="entries"] .sa-rowcard')
    await shot(page, 'list-dark', 'phone')
    await ctx.close()
  }
  {
    // uninstalled while open: the list loaded, then every call answers 409 not_installed
    const scenario = {}
    const ctx = await browser.newContext({ viewport: sizes.phone, deviceScaleFactor: 2, hasTouch: true, isMobile: true })
    await ctx.addInitScript(() => { localStorage.setItem('gcr_business_session_v1', JSON.stringify({ access_token: 'stub-not-a-real-token', expires_at: 4102444800, user: { email: 'owner@example.test' } })) })
    await ctx.route(`${API}/**`, makeStub(scenario))
    const page = await ctx.newPage()
    await page.goto(BASE)
    await page.waitForSelector('.fl-grid')
    await openTile(page, 'Feedback')
    await page.waitForSelector('[data-resource="entries"] .sa-rowcard')
    scenario.gone = 'feedback'
    await page.getByRole('button', { name: /^Delete/ }).first().click()
    await page.locator('.confirm-sheet').getByRole('button', { name: 'Delete' }).click()
    await page.waitForSelector('.sa-problem')
    await shot(page, 'uninstalled', 'phone')
    await ctx.close()
  }
  {
    // offline: the network goes away after the app loaded; a save says so and keeps what was typed
    const ctx = await browser.newContext({ viewport: sizes.phone, deviceScaleFactor: 2, hasTouch: true, isMobile: true })
    await ctx.addInitScript(() => { localStorage.setItem('gcr_business_session_v1', JSON.stringify({ access_token: 'stub-not-a-real-token', expires_at: 4102444800, user: { email: 'owner@example.test' } })) })
    const stub = makeStub({})
    let offline = false
    await ctx.route(`${API}/**`, (route) => (offline && route.request().method() !== 'OPTIONS' ? route.abort('internetdisconnected') : stub(route)))
    const page = await ctx.newPage()
    await page.goto(BASE)
    await page.waitForSelector('.fl-grid')
    await openTile(page, 'Feedback')
    await page.waitForSelector('[data-resource="entries"] .sa-rowcard')
    await page.locator('[data-resource="entries"]').getByRole('button', { name: /^Add to / }).click()
    await page.locator('.sa-sheet').getByLabel('How was it?').fill('4')
    await page.locator('.sa-sheet').getByLabel('Your feedback').fill('Lovely evening.')
    offline = true
    await page.locator('.sa-sheet').getByRole('button', { name: 'Add', exact: true }).click()
    await page.waitForSelector('.sa-banner')
    await shot(page, 'offline-save', 'phone')
    await ctx.close()
  }
} finally {
  await browser.close()
}
