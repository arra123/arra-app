import assert from 'node:assert/strict';
import {test} from 'node:test';
import {activityNeedsUpdate} from '../src/ara/live-activity.js';

test('Live Activity retries failed delivery and refreshes unchanged data',()=>{
  const previous={body:'same',at:100,delivered:true};
  assert.equal(activityNeedsUpdate(previous,'same',101),false);
  assert.equal(activityNeedsUpdate(previous,'changed',101),true);
  assert.equal(activityNeedsUpdate({...previous,delivered:false},'same',101),true);
  assert.equal(activityNeedsUpdate(previous,'same',120100),true);
  assert.equal(activityNeedsUpdate(null,'same',101),true);
});
