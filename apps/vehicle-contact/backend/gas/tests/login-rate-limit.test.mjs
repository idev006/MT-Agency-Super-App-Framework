// Login rate limit reads only the newest 6 FAILED events of a username (VC-ADR-048 tune-up): same decisions as reading every
// event, and the number of rows read no longer grows with the account's login history.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {loginFlow, LOGIN_FAILURE_LIMIT, LOGIN_WINDOW_MS} from '../src/application/flows/AuthFlows.js';
import {runFlowSync} from '../src/application/flows/FlowRunner.js';

const NOW = Date.parse('2026-11-27T12:00:00.000Z');
const sha256 = x => createHash('sha256').update(String(x)).digest('hex');
const digest = sha256('username:staff');
function world(events) {
  const rows = {vc_security_events: events.map((e, i) => ({event_id: 'e' + i, username_digest: digest, ...e})),
    vc_users: [{user_id: 'u1', username_normalized: 'staff', status: 'ACTIVE', password_hash: 'ok', password_change_required: false}],
    vc_settings: [{key: 'idle_timeout_minutes', value: '30'}], vc_user_roles: [], vc_user_permissions: [], vc_sessions: []};
  const read = [];
  const match = (r, f) => Object.entries(f || {}).every(([k, v]) => r[k] === v);
  const store = {
    readMany: (reqs, opts = {}) => { for (const [t, row] of opts.inserts || []) rows[t].push(row);
      return reqs.map(r => { const hit = rows[r.name].filter(x => match(x, r.filter));
        if (r.kind === 'newest') { const out = hit.slice().reverse().slice(0, r.limit || 1); read.push([r.name, out.length]); return out; }
        return r.kind === 'one' ? hit[0] || null : hit; }); },
    insert: (t, row) => (rows[t].push(row), row), patch: () => true
  };
  let n = 0;
  const run = () => runFlowSync(loginFlow({username: 'staff', password: 'Synthetic-Passw0rd!'},
    {now: () => new Date(NOW).toISOString(), id: () => (++n).toString(16).padStart(64, '0'), sha256}),
    {store, passwords: {verify: () => true, hash: () => 'x', needsRehash: () => false}});
  return {run, read};
}

test('RATE-01 the 6th failure inside 15 minutes locks; 5 do not; older failures and successes never count', () => {
  const ago = m => new Date(NOW - m * 60000).toISOString();
  const fail = m => ({status: 'FAILED', created_at: ago(m)}), ok = m => ({status: 'SUCCESS', created_at: ago(m)});
  assert.equal(LOGIN_FAILURE_LIMIT, 6); assert.equal(LOGIN_WINDOW_MS, 15 * 60000);
  const five = world([1, 2, 3, 4, 5].map(fail));
  assert.ok(five.run().sessionToken, '5 recent failures: still allowed');
  assert.throws(() => world([1, 2, 3, 4, 5, 6].map(fail)).run(), /LOGIN_RATE_LIMIT/, '6 recent failures: locked');
  assert.ok(world([20, 2, 3, 4, 5, 6].map(fail)).run().sessionToken, 'the oldest of the 6 is outside the window: allowed');
  // a long history of successful logins (e.g. a daily user) plus old failures: allowed, and only failures are read
  const busy = world([...Array.from({length: 1200}, (_, i) => ok(i + 1)), ...[30, 40, 50, 60, 70, 80].map(fail)]);
  assert.ok(busy.run().sessionToken);
  assert.deepEqual(busy.read[0], ['vc_security_events', 6], 'at most 6 rows read, whatever the history');
});
