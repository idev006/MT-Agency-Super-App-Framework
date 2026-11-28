#!/usr/bin/env node
// G1 (VC-ADR-053/056): the live check of the GAS web app after a push + pin. Replaces the old full-API publish check
// (verify-live-publish.mjs expects the GAS API, which a bridge-only project no longer has).
//   node scripts/verify-bridge-live.mjs [--expect bridge|full]
// Reads the pinned web app URL from ONE place (contracts/trusted-endpoints.v1.json, id gas-webapp).
// public GET health (no credentials, no data) and checks which artifact answers and its version. The signed bridge
// operations themselves are proven by the deploy chain: the photo-audit job (list / stat through the bridge) and the
// live suite through the core (photos.upload / vehicles.photo).
import {readFileSync} from 'node:fs';

const root = new URL('../../../../../', import.meta.url);
const url = JSON.parse(readFileSync(new URL('apps/vehicle-contact/contracts/trusted-endpoints.v1.json', root), 'utf8')).endpoints.find(e => e.id === 'gas-webapp')?.url;
const expect = process.argv.includes('--expect') ? process.argv[process.argv.indexOf('--expect') + 1] : 'any';
const version = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;
if (!url) { console.error('BRIDGE_URL_NOT_FOUND in contracts/trusted-endpoints.v1.json (gas-webapp)'); process.exit(1); }

const res = await fetch(url, {redirect: 'follow', signal: AbortSignal.timeout(30000)});
const body = await res.json().catch(() => null);
const data = body && body.data;
const artifact = data?.service === 'p6vc-media-bridge' ? 'bridge' : data?.service === 'p6-vehicle-contact' ? 'full' : 'unknown';
const live = data?.bridgeVersion || data?.backendVersion || '';
const checks = {http: res.status === 200, ok: body?.ok === true, artifact: expect === 'any' ? artifact !== 'unknown' : artifact === expect,
  version: live === version};
const pass = Object.values(checks).every(Boolean);
console.log('BRIDGE_LIVE ' + JSON.stringify({status: pass ? 'PASS' : 'FAIL', artifact, liveVersion: live, expectedVersion: version, checks}));
process.exit(pass ? 0 : 1);
