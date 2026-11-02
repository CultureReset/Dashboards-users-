import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { auth } from '../src/lib/paperclip.js'

test('Paperclip API responses and SPA routing', async (t) => {
  const originalFetch = globalThis.fetch
  try {
    await t.test('HTML 200 is not a signed-in session', async () => {
      globalThis.fetch = async () => new Response('<!doctype html><html>Dashboard</html>', { status: 200 })
      await assert.rejects(auth.session(), e => e.status === 502 && /invalid response/.test(e.message))
    })
    await t.test('malformed JSON is rejected', async () => {
      globalThis.fetch = async () => new Response('{broken', { status: 200 })
      await assert.rejects(auth.session(), e => e.status === 502)
    })
    await t.test('401 remains signed out', async () => {
      globalThis.fetch = async () => Response.json({ error: 'Unauthorized' }, { status: 401 })
      assert.equal(await auth.session(), null)
    })
    await t.test('503 configuration error remains actionable', async () => {
      globalThis.fetch = async () => Response.json({ error: 'PAPERCLIP_SERVER_URL is not set for this deployment' }, { status: 503 })
      await assert.rejects(auth.session(), e => e.status === 503 && /PAPERCLIP_SERVER_URL/.test(e.message))
    })
    await t.test('valid session stays intact', async () => {
      const body = { user: { id: 'test-user' }, session: { id: 'test-session' } }
      globalThis.fetch = async () => Response.json(body)
      assert.deepEqual(await auth.session(), body)
    })
    await t.test('empty 204 stays signed out', async () => {
      globalThis.fetch = async () => new Response(null, { status: 204 })
      assert.equal(await auth.session(), null)
    })
    await t.test('SPA fallback excludes API and asset paths', async () => {
      const config = JSON.parse(await readFile(new URL('../vercel.json', import.meta.url), 'utf8'))
      const fallback = new RegExp('^' + config.rewrites.find(r => r.destination === '/index.html').source + '$')
      assert.equal(fallback.test('/api/paperclip/auth/get-session'), false)
      assert.equal(fallback.test('/assets/index.js'), false)
      assert.equal(fallback.test('/dashboard'), true)
      assert.equal(fallback.test('/'), true)
    })
  } finally {
    globalThis.fetch = originalFetch
  }
})
