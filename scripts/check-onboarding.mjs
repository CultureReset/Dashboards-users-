#!/usr/bin/env node
/**
 * Prove the setup flow's rules without a browser, a network or storage.
 *
 *   node scripts/check-onboarding.mjs
 *
 * Covers: which apps are recommended, how steps move (including steps the
 * server cannot offer), the plain-words permission map, the skip rules and
 * when the flow opens by itself.
 */

import assert from 'node:assert/strict'
import { recommendApps, pickTools, normalizeIndustry, isInstallable, MAX_RECOMMENDED, MAX_TOOLS } from '../src/onboarding/recommend.js'
import {
  STEPS, nextStep, prevStep, canSkip, canGoBack, initialState, reduce, persistable,
  switchedOn, appsToInstall, pendingAccess, priceLabel, permissionWords, classifyError, installMessage,
  asksForAccess, shouldAutoShow, isFreshSignup, FRESH_WINDOW_MS, parseStored, summarize,
} from '../src/onboarding/logic.js'
import { decideLanding } from '../src/lib/dashboardView.js'

let passed = 0
const check = (name, fn) => { fn(); passed++; console.log(`ok - ${name}`) }

const app = (key, over = {}) => ({
  id: `id-${key}`, key, name: key, installed: null, entitled: true, available: { version: 1, permissions: [] }, reason: 'free', ...over,
})
const song = app('song-request')
const merch = app('merch-store')
const paid = app('crm', { reason: 'plan' })
const free = (n) => app(`free-${n}`)

/* ── recommendations ── */

check('industry recommendations pick the mapped keys the store offers', () => {
  assert.deepEqual(recommendApps([song, merch, paid], 'artist'), [song.id, merch.id])
  assert.deepEqual(recommendApps([song, merch], 'restaurant'), [merch.id])
  assert.deepEqual(recommendApps([song, merch], 'live-music-venue'), [song.id, merch.id])
})
check('unknown or missing industry falls back to the first free apps, max 3', () => {
  const items = [paid, free(1), free(2), free(3), free(4)]
  assert.deepEqual(recommendApps(items, 'basket-weaving'), [free(1).id, free(2).id, free(3).id])
  assert.deepEqual(recommendApps(items, null), [free(1).id, free(2).id, free(3).id])
  assert.equal(recommendApps(items, undefined).length, MAX_RECOMMENDED)
})
check('a mapped industry whose apps are not offered also falls back safely', () => {
  assert.deepEqual(recommendApps([paid, free(1)], 'artist'), [free(1).id])
})
check('fallback never switches on a paid or plan-only app, and handles empty input', () => {
  assert.deepEqual(recommendApps([paid], 'nothing'), [])
  assert.deepEqual(recommendApps([], 'artist'), [])
  assert.deepEqual(recommendApps(null, 'artist'), [])
})
check('installed, not-entitled or version-less apps are never recommended', () => {
  const items = [app('merch-store', { installed: { version: 1 } }), app('song-request', { entitled: false }), app('x', { available: null })]
  assert.deepEqual(recommendApps(items, 'artist'), [])
  assert.equal(isInstallable(items[0]), false)
})
check('industry values are normalised', () => {
  assert.equal(normalizeIndustry('  Restaurant '), 'restaurant')
  assert.equal(normalizeIndustry('Live Music'), 'artist')
  assert.equal(normalizeIndustry(''), '')
  assert.equal(normalizeIndustry(null), '')
})
check('tool picking: at most 6, relevant first, original order otherwise, junk ignored', () => {
  const tools = Array.from({ length: 10 }, (_, i) => ({ tool_id: `t${i}`, name: `Tool ${i}`, cat: 'misc' }))
  tools.push({ tool_id: 'googlecalendar', name: 'Google Calendar', cat: 'scheduling' }, null, { name: 'no id' })
  const picked = pickTools(tools, 'service')
  assert.equal(picked.length, MAX_TOOLS)
  assert.equal(picked[0].tool_id, 'googlecalendar')
  assert.deepEqual(picked.slice(1).map((t) => t.tool_id), ['t0', 't1', 't2', 't3', 't4'])
  assert.deepEqual(pickTools(undefined, 'x'), [])
})

/* ── steps ── */

check('steps run welcome, apps, tools, done and stop at the ends', () => {
  assert.deepEqual(STEPS, ['welcome', 'apps', 'tools', 'done'])
  assert.equal(nextStep('welcome'), 'apps')
  assert.equal(nextStep('done'), 'done')
  assert.equal(prevStep('apps'), 'welcome')
  assert.equal(prevStep('welcome'), 'welcome')
  assert.equal(canGoBack('welcome'), false)
  assert.equal(canGoBack('tools'), true)
})
check('steps the server cannot offer are passed over in both directions', () => {
  assert.equal(nextStep('welcome', ['apps']), 'tools')
  assert.equal(nextStep('welcome', ['apps', 'tools']), 'done')
  assert.equal(prevStep('done', ['tools']), 'apps')
  assert.equal(prevStep('done', ['apps', 'tools']), 'welcome')
  assert.equal(nextStep('welcome', ['welcome', 'done']), 'apps') // those two are never skipped
})
check('every step but the last can be skipped, and skipping is remembered', () => {
  assert.deepEqual(STEPS.filter(canSkip), ['welcome', 'apps', 'tools'])
  let s = initialState()
  s = reduce(s, { type: 'skip' })
  assert.equal(s.step, 'apps')
  assert.equal(s.skipped.welcome, true)
  s = reduce(s, { type: 'skip', unavailable: ['tools'] })
  assert.equal(s.step, 'done')
  assert.deepEqual(reduce(s, { type: 'skip' }), s)
})
check('reducer: back, industry, toggles and per-app results', () => {
  let s = initialState()
  s = reduce(s, { type: 'next' })
  s = reduce(s, { type: 'back' })
  assert.equal(s.step, 'welcome')
  s = reduce(s, { type: 'industry', value: 'artist' })
  assert.equal(s.industry, 'artist')
  s = reduce(s, { type: 'toggle', id: 'a', value: true })
  s = reduce(s, { type: 'result', id: 'a', result: { status: 'ok' } })
  assert.equal(s.manual.a, true)
  assert.equal(s.results.a.status, 'ok')
  s = reduce(s, { type: 'clearResult', id: 'a' })
  assert.equal('a' in s.results, false)
  assert.equal(reduce(s, { type: 'nonsense' }), s)
})
check('saved progress resumes, a finished setup restarts, junk is ignored', () => {
  assert.equal(initialState({ step: 'tools', industry: 'coffee', manual: { a: true } }).step, 'tools')
  assert.equal(initialState({ step: 'tools', completed: true }).step, 'welcome')
  assert.equal(initialState({ step: 'bogus' }).step, 'welcome')
  assert.deepEqual(initialState({ manual: 'x', skipped: 5 }).manual, {})
  assert.equal(initialState({ industry: 7 }).industry, null)
  assert.deepEqual(Object.keys(persistable(initialState())).sort(), ['industry', 'manual', 'skipped', 'step'])
})

/* ── switches and installing ── */

check('switches start from the recommendation and follow what the person touched', () => {
  const items = [song, merch, paid]
  assert.deepEqual([...switchedOn(items, 'artist', {})].sort(), [merch.id, song.id].sort())
  assert.deepEqual([...switchedOn(items, 'artist', { [song.id]: false })], [merch.id])
  assert.deepEqual([...switchedOn(items, 'artist', { [paid.id]: true })].includes(paid.id), true)
  assert.equal(switchedOn(items, 'artist', { ghost: true }).has('ghost'), false)
})
check('Continue installs only what is on and not already done or waiting for consent', () => {
  const items = [song, merch, paid]
  const on = new Set([song.id, merch.id, paid.id])
  const results = { [song.id]: { status: 'ok' }, [merch.id]: { status: 'needs_access', permissions: ['x'] }, [paid.id]: { status: 'failed' } }
  assert.deepEqual(appsToInstall(items, on, results).map((i) => i.id), [paid.id])
  assert.deepEqual(pendingAccess(results), [merch.id])
  assert.deepEqual(appsToInstall(items, new Set(), {}), [])
})
check('labels: free, in plan, granted', () => {
  assert.equal(priceLabel({ reason: 'free' }), 'Free')
  assert.equal(priceLabel({ reason: 'plan' }), 'In your plan')
  assert.equal(priceLabel({ reason: 'grant' }), 'Included for you')
  assert.equal(priceLabel({}), 'Available')
})

/* ── words ── */

check('permission codes become plain words; unknown ones get a safe fallback', () => {
  assert.match(permissionWords('public_page'), /page/)
  assert.match(permissionWords('collect_submissions'), /customers/)
  for (const code of ['public_page', 'collect_submissions', 'store_records', 'owner_settings']) {
    assert.ok(!permissionWords(code).includes('_'), code)
  }
  assert.equal(permissionWords('read_entity_hours'), 'Access to read entity hours')
  assert.equal(permissionWords(''), 'Extra access to your business account')
  assert.equal(permissionWords(undefined), 'Extra access to your business account')
  assert.equal(permissionWords('<script>'), 'Extra access to your business account')
  assert.equal(permissionWords({}), 'Extra access to your business account')
  assert.equal(permissionWords('x'.repeat(80)), 'Extra access to your business account')
})
check('errors: 404/405/501 mean unavailable, 0 is network or timeout, messages stay readable', () => {
  for (const status of [404, 405, 501]) assert.equal(classifyError({ status }).kind, 'unavailable')
  assert.equal(classifyError({ status: 0, message: 'Request timed out after 30000ms' }).kind, 'timeout')
  assert.equal(classifyError({ status: 0, message: 'Network error — could not reach the API' }).kind, 'network')
  assert.equal(classifyError({ status: 401 }).kind, 'auth')
  assert.equal(classifyError({ status: 500, message: 'Store is down.' }).message, 'Store is down.')
  assert.equal(classifyError({ status: 500, message: '<html>oops</html>' }).message, 'Something went wrong. Please try again.')
  assert.equal(classifyError({ status: 500, message: 'Request failed (500 )' }).message, 'Something went wrong. Please try again.')
  assert.equal(classifyError(null).kind, 'network')
})
check('install errors: access request is recognised; others are worded for people', () => {
  assert.equal(asksForAccess({ status: 409, body: { permissions: ['a'] } }), true)
  assert.equal(asksForAccess({ status: 409, body: { error: 'Already installed' } }), false)
  assert.equal(asksForAccess({ status: 409, body: { permissions: [] } }), false)
  assert.equal(asksForAccess({ status: 500, body: { permissions: ['a'] } }), false)
  assert.match(installMessage({ status: 403 }), /plan/)
  assert.match(installMessage({ status: 404 }), /no longer available/)
})

/* ── when it opens ── */

check('opens after sign-up and on a first visit with nothing installed', () => {
  const base = { viewingAsAdmin: false, stored: null, installedCount: 0, storeKnown: true }
  assert.equal(shouldAutoShow(base), true)
  assert.equal(shouldAutoShow({ ...base, stored: { fresh: true }, storeKnown: false }), true)
})
check('never opens with apps installed, after dismissal or completion, or when the store is unknown', () => {
  const base = { viewingAsAdmin: false, stored: null, installedCount: 0, storeKnown: true }
  assert.equal(shouldAutoShow({ ...base, installedCount: 2 }), false)
  assert.equal(shouldAutoShow({ ...base, stored: { dismissed: true } }), false)
  assert.equal(shouldAutoShow({ ...base, stored: { completed: true, fresh: true } }), false)
  assert.equal(shouldAutoShow({ ...base, storeKnown: false }), false)
})
check('never opens for an admin viewing a business, even right after sign-up', () => {
  assert.equal(shouldAutoShow({ viewingAsAdmin: true, stored: { fresh: true }, installedCount: 0, storeKnown: true }), false)
})
check('a sign-up marker is believed only briefly', () => {
  const now = 1_000_000_000_000
  assert.equal(isFreshSignup(now - 1000, now), true)
  assert.equal(isFreshSignup(now - FRESH_WINDOW_MS - 1, now), false)
  assert.equal(isFreshSignup(now + 60_000, now), false)
  assert.equal(isFreshSignup(NaN, now), false)
})
check('stored progress is validated', () => {
  assert.equal(parseStored(null), null)
  assert.equal(parseStored('not json'), null)
  assert.equal(parseStored('[1]'), null)
  assert.equal(parseStored('"x"'), null)
  const ok = parseStored(JSON.stringify({ step: 'apps', industry: 'artist', manual: { a: true }, dismissed: true }))
  assert.equal(ok.step, 'apps')
  assert.equal(ok.dismissed, true)
  assert.equal(ok.completed, false)
  assert.equal(parseStored(JSON.stringify({ step: 'zzz', manual: [] })).step, 'welcome')
  assert.deepEqual(parseStored(JSON.stringify({ manual: [] })).manual, {})
})

/* ── summary ── */

check('summary lists installed apps and connected tools and explains what was left out', () => {
  const items = [app('a', { installed: { version: 1 } }), app('b'), app('c')]
  const sum = summarize({
    items, results: { 'id-b': { status: 'ok' }, 'id-c': { status: 'failed' } },
    tools: [{ tool_id: 't', name: 'T', connection: { status: 'connected' } }, { tool_id: 'u', name: 'U', connection: { status: 'pending' } }],
    unavailable: [], skipped: {},
  })
  assert.deepEqual(sum.installed.map((i) => i.key), ['a', 'b'])
  assert.deepEqual(sum.connected.map((t) => t.tool_id), ['t'])
  const none = summarize({ items: [], results: {}, tools: [], unavailable: ['apps', 'tools'], skipped: {} })
  assert.match(none.appsNote, /not open/)
  assert.match(none.toolsNote, /not switched on/)
  assert.match(summarize({ items: [], results: {}, tools: [], skipped: { apps: true, tools: true } }).appsNote, /skipped/)
  assert.equal(summarize({}).installed.length, 0)
})

/* ── integration: the single landing rule (wizard vs app grid vs Setup) ────── */

check('landing: a brand-new owner (no installs, no data) gets the wizard', () => {
  assert.equal(decideLanding({ sectionCount: 0, populatedCount: 0, installCount: 0 }), 'wizard')
})
check('landing: one install or one section goes to the app grid, never the wizard', () => {
  assert.equal(decideLanding({ sectionCount: 0, installCount: 1 }), 'home')
  assert.equal(decideLanding({ sectionCount: 1, populatedCount: 1, installCount: 0 }), 'home')
  assert.equal(decideLanding({ sectionCount: 3, populatedCount: 3, installCount: 2, stored: { fresh: true } }), 'home')
})
check('landing: enabled-but-empty module stubs do not hide the wizard, but do put tiles on the grid after it', () => {
  assert.equal(decideLanding({ sectionCount: 2, populatedCount: 0, installCount: 0 }), 'wizard')
  assert.equal(decideLanding({ sectionCount: 2, populatedCount: 0, installCount: 0, stored: { dismissed: true } }), 'home')
})
check('landing: once dismissed or completed the wizard does not come back (Setup page if nothing exists)', () => {
  assert.equal(decideLanding({ stored: { dismissed: true } }), 'setup')
  assert.equal(decideLanding({ stored: { completed: true, fresh: true } }), 'setup')
})
check('landing: never the wizard in an admin view-as, even for a fresh empty business', () => {
  assert.equal(decideLanding({ viewingAsAdmin: true, stored: { fresh: true } }), 'setup')
  assert.equal(decideLanding({ viewingAsAdmin: true, installCount: 1 }), 'home')
})
check('landing: an unknown Store only opens the wizard right after sign-up', () => {
  assert.equal(decideLanding({ storeKnown: false }), 'setup')
  assert.equal(decideLanding({ storeKnown: false, stored: { fresh: true } }), 'wizard')
})
check('landing: data that already exists beats a stale sign-up marker', () => {
  assert.equal(shouldAutoShow({ viewingAsAdmin: false, stored: { fresh: true }, installedCount: 0, storeKnown: true, sectionCount: 2 }), false)
  assert.equal(shouldAutoShow({ viewingAsAdmin: false, stored: { fresh: true }, installedCount: 1, storeKnown: true }), false)
})

console.log(`\n${passed} onboarding checks passed`)
