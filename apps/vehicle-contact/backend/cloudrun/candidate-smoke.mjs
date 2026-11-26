// Cloud Run smoke for the safe deploy (owner 2026-11-26: Cloud Run only is fine "แต่ไม่อยากให้เกิด" an outage).
// Used twice by deploy-vehicle-cloudrun.yml: on the new revision's private tag URL BEFORE it gets traffic, and on the
// service URL right after the switch (a failure there moves traffic back to the previous revision). Also used by the
// rollback workflow. Public, non-sensitive requests only: no credentials, no vehicle data, no writes.
//   node candidate-smoke.mjs <https://...run.app> [--version 0.9.36 | --any-version]
export const RUN_APP_URL = /^https:\/\/(candidate---)?p6vc-(api|core)-[a-z0-9-]+\.[a-z0-9-]+\.run\.app\/?$/; // legacy + core (VC-ADR-046)
const msg = (group, action, payload = {}, extra = {}) => ({apiVersion: 'v1', group, action, payload, requestId: 'deploy-smoke', ...extra});

// [name, request, expected ok, expected error code]
export const SMOKE_CHECKS = Object.freeze([
  ['GET_HEALTH', null, true, null],
  ['POST_HEALTH', msg('system', 'health'), true, null],
  // reads Firestore (campaign lookup) without writing: a broken database/credential gives OPERATION_FAILED instead
  ['FIRESTORE_READ', msg('campaigns', 'validate', {campaignToken: 'a'.repeat(64)}), false, 'CAMPAIGN_INVALID'],
  ['PROTECTED_NEEDS_SESSION', msg('vehicles', 'list', {}), false, 'UNAUTHENTICATED'],
  ['BAD_API_VERSION', msg('system', 'health', {}, {apiVersion: 'v9'}), false, 'BAD_REQUEST'],
]);

export async function smoke(url, {version = null, fetchImpl = fetch, timeoutMs = 20000} = {}) {
  if (!RUN_APP_URL.test(url)) throw new Error('not a p6vc-api run.app URL');
  const base = url.replace(/\/$/, ''), results = [];
  for (const [name, body, okExpected, code] of SMOKE_CHECKS) {
    let pass = false, detail = '';
    try {
      const r = await fetchImpl(base, {method: body ? 'POST' : 'GET', signal: AbortSignal.timeout(timeoutMs),
        ...(body ? {headers: {'content-type': 'text/plain;charset=utf-8'}, body: JSON.stringify(body)} : {})});
      const data = await r.json();
      if (name === 'GET_HEALTH') {
        const ready = data?.status === 'ready' || data?.data?.status === 'ready';
        const got = data?.backendVersion || data?.data?.backendVersion || '';
        pass = ready && (!version || got === version);
        detail = `status=${data?.status || data?.data?.status} version=${got}${version ? ' expected=' + version : ''}`;
      } else {
        pass = data?.ok === okExpected && (okExpected || data?.error?.code === code);
        detail = `ok=${data?.ok} code=${data?.error?.code || 'none'}`;
      }
    } catch (e) { detail = 'error ' + String(e.message).slice(0, 120); }
    results.push({name, pass, detail});
  }
  return {pass: results.every(r => r.pass), results};
}

if (process.argv[1] && process.argv[1].endsWith('candidate-smoke.mjs')) {
  const url = process.argv[2] || '';
  const i = process.argv.indexOf('--version');
  let version = i > 0 ? process.argv[i + 1] : null;
  if (!version && !process.argv.includes('--any-version')) {
    const fs = await import('node:fs');
    version = JSON.parse(fs.readFileSync(new URL('../gas/scripts/expected-live-version.json', import.meta.url), 'utf8')).backendVersion;
  }
  const r = await smoke(url, {version});
  for (const x of r.results) console.log(`${x.pass ? 'PASS' : 'FAIL'} ${x.name} ${x.detail}`);
  console.log('SMOKE ' + JSON.stringify({pass: r.pass, url: new URL(url).hostname, version}));
  process.exitCode = r.pass ? 0 : 1;
}
