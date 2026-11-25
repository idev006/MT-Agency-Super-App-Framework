// SIVP section 10/11: endpoint allowlist is exact (parsed URL vs contracts/trusted-endpoints.v1.json).
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateTrustedEndpoint, resolveApiBaseUrl, TRUSTED_ENDPOINTS} from '../scripts/trusted-endpoint.mjs';

const GAS = TRUSTED_ENDPOINTS.find(e => e.kind === 'gas').url;
const CR = TRUSTED_ENDPOINTS.find(e => e.kind === 'cloud-run').url;

test('TE-01 the two trusted endpoints are accepted (a trailing slash on Cloud Run normalises)', () => {
  assert.deepEqual(validateTrustedEndpoint(GAS), {url: GAS, kind: 'gas', id: 'gas-webapp'});
  assert.equal(validateTrustedEndpoint(CR).kind, 'cloud-run');
  assert.equal(validateTrustedEndpoint(CR + '/').url, CR);
});

test('TE-02 lookalikes, other projects/deployments and unsafe URL parts are refused', () => {
  const bad = {
    'http://p6vc-api-46858005337.asia-southeast3.run.app': 'ENDPOINT_NOT_HTTPS',
    'https://p6vc-api-99999999999.asia-southeast3.run.app': 'ENDPOINT_NOT_TRUSTED',
    'https://p6vc-api-46858005337.asia-southeast1.run.app': 'ENDPOINT_NOT_TRUSTED',
    'https://p6vc-api-46858005337.asia-southeast3.run.app.evil.example': 'ENDPOINT_NOT_TRUSTED',
    'https://evil.example/p6vc-api-46858005337.asia-southeast3.run.app': 'ENDPOINT_NOT_TRUSTED',
    'https://p6vc-api-46858005337.asia-southeast3.run.app/admin': 'ENDPOINT_NOT_TRUSTED',
    'https://p6vc-api-46858005337.asia-southeast3.run.app:8443': 'ENDPOINT_HAS_PORT',
    'https://user:pw@p6vc-api-46858005337.asia-southeast3.run.app': 'ENDPOINT_HAS_CREDENTIALS',
    'https://p6vc-api-46858005337.asia-southeast3.run.app/?x=1': 'ENDPOINT_HAS_QUERY',
    'https://p6vc-api-46858005337.asia-southeast3.run.app/#f': 'ENDPOINT_HAS_FRAGMENT',
    'https://script.google.com/macros/s/AnotherDeploymentId/exec': 'ENDPOINT_NOT_TRUSTED',
    'https://script.google.com/macros/s/AKfycby15c-Aux2za0BuedeIYni8-tc6rkf9ZVNmw-6ZMTgPvG9SvFjuQVSzNoMouiMhqTmxrA/dev': 'ENDPOINT_NOT_TRUSTED',
    'not a url': 'ENDPOINT_UNPARSEABLE',
    '': 'ENDPOINT_MISSING',
  };
  for (const [url, code] of Object.entries(bad)) assert.throws(() => validateTrustedEndpoint(url), new RegExp(code), url);
});

test('TE-03 config precedence: neutral name wins, legacy alias accepted, conflicting values fail closed, missing fails', () => {
  assert.equal(resolveApiBaseUrl({P6VC_API_BASE_URL: CR}).kind, 'cloud-run');
  assert.equal(resolveApiBaseUrl({P6VC_GAS_EXEC_URL: GAS}).kind, 'gas');
  assert.equal(resolveApiBaseUrl({P6VC_API_BASE_URL: CR, P6VC_GAS_EXEC_URL: CR}).kind, 'cloud-run');
  assert.throws(() => resolveApiBaseUrl({P6VC_API_BASE_URL: CR, P6VC_GAS_EXEC_URL: GAS}), /CONFLICTING_API_BASE_URL/);
  assert.throws(() => resolveApiBaseUrl({}), /ENDPOINT_MISSING/);
});
