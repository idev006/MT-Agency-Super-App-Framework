// L1 (VC-ADR-056): the local dev server starts with no cloud access and serves the real browser gateway — sign in, an
// operation answered by the core, the 645 reference rows, an open campaign.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import path from 'node:path';
import {SAMPLE_PASSWORD} from './support/core-harness.mjs';

test('L1-01 local dev server: sign in, core-answered list, reference rows, open campaign — no cloud', async () => {
  const script = path.resolve(import.meta.dirname, '../scripts/dev-server.mjs');
  const child = spawn(process.execPath, [script], {env: {...process.env, PORT: '0', FIRESTORE_PROJECT_ID: '', GOOGLE_APPLICATION_CREDENTIALS: ''}, stdio: ['ignore', 'pipe', 'pipe']});
  try {
    let out = '';
    const url = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(Error('dev server did not start: ' + out)), 20000);
      child.stdout.on('data', d => { out += d; const m = out.match(/(http:\/\/localhost:\d+\/api\/frontend)/); if (m && /core answers \d+ operations/.test(out)) { clearTimeout(timer); resolve(m[1]); } });
      child.on('exit', code => reject(Error('dev server exited ' + code + ': ' + out)));
    });
    const token = (out.match(/campaign token for the public form: ([0-9a-f]{64})/) || [])[1];
    assert.ok(token, 'an open campaign');
    const call = async (group, action, payload, sessionToken) => {
      const r = await fetch(url, {method: 'POST', headers: {'content-type': 'application/json', origin: 'http://localhost:5175'},
        body: JSON.stringify({apiVersion: 'v1', group, action, payload, requestId: 'req_devsmoke1', ...(sessionToken ? {sessionToken} : {})})});
      return {body: await r.json(), engine: r.headers.get('x-p6vc-answered-by'), cors: r.headers.get('access-control-allow-origin')};
    };
    const login = await call('auth', 'login', {username: 'reg', password: SAMPLE_PASSWORD});
    assert.equal(login.body.ok, true, JSON.stringify(login.body.error)); assert.equal(login.engine, 'core'); assert.equal(login.cors, 'http://localhost:5175');
    const session = login.body.data.sessionToken;
    const list = await call('vehicles', 'list', {page: 1, pageSize: 10}, session);
    assert.equal(list.body.ok, true); assert.equal(list.engine, 'core');
    const valid = await call('campaigns', 'validate', {campaignToken: token});
    assert.equal(valid.body.data.valid, true);
    const refs = await call('references', 'registration', {}, session);
    assert.equal(refs.body.ok, true, JSON.stringify(refs.body.error));
    assert.ok(JSON.stringify(refs.body.data).length > 20000, 'the 645 reference rows are seeded');
  } finally { child.kill(); }
});
