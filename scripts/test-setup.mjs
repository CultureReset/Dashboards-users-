import test from 'node:test'
import assert from 'node:assert/strict'
import { calendarStatus, recommendedTables } from '../src/lib/setupGuide.js'

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
