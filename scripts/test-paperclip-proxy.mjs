import test from 'node:test'
import assert from 'node:assert/strict'
import handler from '../api/paperclip.js'

test('Paperclip proxy routing', async (t) => {
  const originalFetch = globalThis.fetch
  const originalServer = process.env.PAPERCLIP_SERVER_URL
  try {
    await t.test('missing configuration returns JSON 503', async () => {
      delete process.env.PAPERCLIP_SERVER_URL
      const response = await handler(new Request('https://dashboard.example/api/paperclip'))
      assert.equal(response.status, 503)
      assert.match((await response.json()).error, /PAPERCLIP_SERVER_URL/)
    })
    await t.test('explicit rewrite preserves endpoint and business query', async () => {
      process.env.PAPERCLIP_SERVER_URL = 'https://pc.example/'
      globalThis.fetch = async (url, options) => {
        assert.equal(url, 'https://pc.example/api/companies?scope=accessible')
        assert.equal(options.method, 'GET')
        return Response.json([])
      }
      const response = await handler(new Request('https://dashboard.example/api/paperclip?__paperclip_path=companies&scope=accessible'))
      assert.equal(response.status, 200)
    })
    await t.test('upstream authentication failures are preserved', async () => {
      process.env.PAPERCLIP_SERVER_URL = 'https://pc.example'
      globalThis.fetch = async (url) => {
        assert.equal(url, 'https://pc.example/api/auth/get-session')
        return Response.json({error:'Unauthorized'}, {status:401})
      }
      const response = await handler(new Request('https://dashboard.example/api/paperclip?__paperclip_path=auth%2Fget-session'))
      assert.equal(response.status, 401)
    })
  } finally {
    globalThis.fetch = originalFetch
    if (originalServer === undefined) delete process.env.PAPERCLIP_SERVER_URL
    else process.env.PAPERCLIP_SERVER_URL = originalServer
  }
})
