// VC-ADR-041 safe deploy: the smoke that gates switching traffic (and that triggers the automatic rollback).
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {smoke, RUN_APP_URL, SMOKE_CHECKS} from '../../cloudrun/candidate-smoke.mjs';

const healthy = version => async (url, init) => {
  if (!init.body) return {json: async () => ({status: 'ready', backendVersion: version})};
  const b = JSON.parse(init.body), err = code => ({json: async () => ({ok: false, error: {code}})});
  if (b.apiVersion !== 'v1') return err('BAD_REQUEST');
  if (b.group === 'system') return {json: async () => ({ok: true, data: {status: 'ready'}})};
  if (b.group === 'campaigns') return err('CAMPAIGN_INVALID');
  return err('UNAUTHENTICATED');
};

test('DEPLOY-01 only p6vc-api run.app URLs (service URL or the candidate tag URL)', () => {
  assert.ok(RUN_APP_URL.test('https://p6vc-api-46858005337.asia-southeast3.run.app'));
  assert.ok(RUN_APP_URL.test('https://candidate---p6vc-api-46858005337.asia-southeast3.run.app'));
  assert.ok(RUN_APP_URL.test('https://candidate---p6vc-api-abc123xyz-as.a.run.app'));
  for (const bad of ['http://p6vc-api-1.x.run.app', 'https://evil.example.com', 'https://p6vc-api-1.x.run.app.evil.com', 'https://other---p6vc-api-1.x.run.app'])
    assert.equal(RUN_APP_URL.test(bad), false, bad);
  assert.ok(SMOKE_CHECKS.some(([n]) => n === 'FIRESTORE_READ'), 'the database is reached, not only the process');
});

test('DEPLOY-02 healthy revision with the expected version passes; wrong version or broken database fails', async () => {
  const url = 'https://candidate---p6vc-api-46858005337.asia-southeast3.run.app';
  assert.equal((await smoke(url, {version: '0.9.37', fetchImpl: healthy('0.9.37')})).pass, true);
  const old = await smoke(url, {version: '0.9.37', fetchImpl: healthy('0.9.36')});
  assert.equal(old.pass, false); assert.equal(old.results[0].name, 'GET_HEALTH');
  assert.equal((await smoke(url, {version: null, fetchImpl: healthy('0.9.36')})).pass, true, '--any-version (rollback)');
  const brokenDb = async (u, init) => (init.body && JSON.parse(init.body).group === 'campaigns')
    ? {json: async () => ({ok: false, error: {code: 'OPERATION_FAILED'}})} : healthy('0.9.37')(u, init);
  const r = await smoke(url, {version: '0.9.37', fetchImpl: brokenDb});
  assert.equal(r.pass, false); assert.equal(r.results.find(x => x.name === 'FIRESTORE_READ').pass, false);
  const down = async () => { throw new Error('ECONNREFUSED'); };
  assert.equal((await smoke(url, {fetchImpl: down})).pass, false);
  await assert.rejects(smoke('https://evil.example.com', {fetchImpl: healthy('x')}), /run\.app/);
});

// p6vc-api and its deploy / rollback workflows were retired 2026-11-28; the core's workflow keeps the same safe deploy
test('DEPLOY-03 the core deploy workflow gives traffic only after the candidate smoke, and rolls back on a failed live smoke', () => {
  const wf = fs.readFileSync(new URL('../../../../../.github/workflows/deploy-vehicle-core.yml', import.meta.url), 'utf8');
  const at = s => { const i = wf.indexOf(s); assert.ok(i > 0, s); return i; };
  assert.ok(at('--no-traffic --tag candidate') < at('Smoke the candidate') && at('Smoke the candidate') < at('--to-revisions "${{ steps.candidate.outputs.revision }}=100"'));
  assert.ok(at('Smoke the live URL; roll back on failure') < at('--to-revisions "$PREV=100"'));
  assert.ok(!fs.existsSync(new URL('../../../../../.github/workflows/deploy-vehicle-cloudrun.yml', import.meta.url)), 'p6vc-api deploy workflow retired');
});
