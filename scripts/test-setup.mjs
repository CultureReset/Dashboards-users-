import test from 'node:test'
import assert from 'node:assert/strict'
import { calendarStatus, recommendedTables } from '../src/lib/setupGuide.js'
import { finishBusinessSignup } from '../src/lib/signupFlow.js'

test('calendar readiness reflects recorded outcomes, not feed presence', () => {
  assert.equal(calendarStatus([]), 'No feeds added')
  assert.equal(calendarStatus([{feeds:[{is_active:false,last_sync_status:'ok (1 dates blocked)'}]}]), 'No feeds added')
  assert.equal(calendarStatus([{feeds:[{last_sync_status:null}]}]), 'Feeds need verification')
  assert.equal(calendarStatus([{feeds:[{last_sync_status:'error: HTTP 503'}]}]), 'A feed needs attention')
  assert.equal(calendarStatus([{feeds:[{last_sync_status:'ok (1 dates blocked)'},{last_sync_status:'error: HTTP 503'}]}]), 'A feed needs attention')
  assert.equal(calendarStatus([{feeds:[{last_sync_status:'ok (0 dates blocked)'}]}]), '1 feed synchronized')
})
test('recommendations adapt to industry without requiring one', () => {
  assert.ok(recommendedTables('restaurant').includes('menu_sections'))
  assert.ok(recommendedTables('fishing_charter').includes('bookable_resources'))
  assert.ok(recommendedTables().includes('entity_hours'))
  assert.ok(!recommendedTables('restaurant').includes('entity_credentials'))
})
test('session failure after registration retries sign-in without creating another account', async () => {
  let registered = 0, signedIn = 0, created = false
  const run = () => finishBusinessSignup({accountCreated:created,payload:{email:'test@example.invalid',password:'fixture-only'},register:async () => {registered++},onCreated:() => {created=true},signIn:async () => ({error:++signedIn===1 ? new Error('temporary sign-in failure') : null})})
  await assert.rejects(run(), /temporary sign-in failure/)
  assert.equal(created,true)
  await run()
  assert.equal(registered,1)
  assert.equal(signedIn,2)
})
test('failed registration does not attempt sign-in or mark the account created', async () => {
  await assert.rejects(finishBusinessSignup({accountCreated:false,payload:{},register:async()=>{throw new Error('registration failed')},onCreated:()=>assert.fail('marked created'),signIn:()=>assert.fail('attempted sign-in')}), /registration failed/)
})
