// Cloud Run runtime (VC-ADR-033): the unchanged application on Node with env config, the service
// identity token (no key file) and no cross-request session cache.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createCloudRunApplication, runtimeProperties, withMetadataToken, TOKEN_ENDPOINT, METADATA_TOKEN_URL} from '../../cloudrun/runtime.mjs';

const env = {P6VC_AUTH_PEPPER: 'x'.repeat(48), FIRESTORE_PROJECT_ID: 'mt-iam-core-2026', FIRESTORE_DATABASE_ID: '(default)'};
const reply = (code, body) => ({getResponseCode: () => code, getContentText: () => (typeof body === 'string' ? body : JSON.stringify(body))});

function recordingTransport() {
  const calls = [];
  const fetchSync = (url, opts = {}) => {
    calls.push({url: String(url), headers: opts.headers || {}});
    if (url === METADATA_TOKEN_URL) return reply(200, {access_token: 'identity-token', expires_in: 3599, token_type: 'Bearer'});
    if (String(url).endsWith(':runQuery')) return reply(200, [{readTime: '2026-11-25T00:00:00Z'}]);
    if (String(url).endsWith(':batchGet')) return reply(200, []);
    return reply(200, {});
  };
  return {calls, fetchSync};
}

test('CLOUDRUN-01 config comes from env; pepper and project are required; config is read-only', () => {
  assert.throws(() => runtimeProperties({FIRESTORE_PROJECT_ID: 'p'}), /MISSING_ENV_P6VC_AUTH_PEPPER/);
  const props = runtimeProperties(env).getScriptProperties();
  assert.equal(props.getProperty('VEHICLE_FIRESTORE_DATABASE_ID'), '(default)');
  assert.equal(props.getProperty('VEHICLE_API_ENABLED'), 'true');
  assert.throws(() => props.setProperty('VEHICLE_AUTH_PEPPER', 'y'), /READ_ONLY/);
  const report = JSON.stringify(createCloudRunApplication({env, fetchSync: () => reply(200, {})}).inspectConfig());
  assert.ok(!report.includes(env.P6VC_AUTH_PEPPER), 'the config report never shows values');
});

test('CLOUDRUN-02 the token exchange is answered by the service identity (metadata server), other calls pass through', () => {
  const seen = [];
  const t = withMetadataToken((url, opts) => { seen.push([url, opts.headers]); return reply(200, {}); });
  t.fetch(TOKEN_ENDPOINT, {method: 'post', payload: 'assertion=...'});
  t.fetch('https://firestore.googleapis.com/v1/x', {method: 'post'});
  assert.equal(seen[0][0], METADATA_TOKEN_URL);
  assert.equal(seen[0][1]['Metadata-Flavor'], 'Google');
  assert.equal(seen[1][0], 'https://firestore.googleapis.com/v1/x');
});

test('CLOUDRUN-03 health works; an unknown session is UNAUTHENTICATED via Firestore with the identity token; nothing is cached between requests', () => {
  const {calls, fetchSync} = recordingTransport();
  const app = createCloudRunApplication({env, fetchSync});
  assert.equal(app.dispatch({apiVersion: 'v1', group: 'system', action: 'health', payload: {}}, 'GET').ok, true);
  const req = {apiVersion: 'v1', group: 'vehicles', action: 'lookup', payload: {plate: 'กข1', province: '10'}, requestId: 'req_cloudrun_test_1', sessionToken: 'a'.repeat(64)};
  const first = app.dispatch(req, 'POST');
  assert.equal(first.ok, false); assert.equal(first.error.code, 'UNAUTHENTICATED');
  const fs1 = calls.filter(c => c.url.includes('firestore.googleapis.com'));
  assert.ok(fs1.length >= 1, 'the session was looked up in Firestore');
  assert.ok(fs1.every(c => String(c.headers.Authorization || c.headers.authorization) === 'Bearer identity-token'), 'Firestore calls use the identity token');
  const before = calls.length;
  app.dispatch({...req, requestId: 'req_cloudrun_test_2'}, 'POST');
  assert.ok(calls.slice(before).some(c => c.url.includes('firestore.googleapis.com')), 'second request read Firestore again (no session cache)');
});
