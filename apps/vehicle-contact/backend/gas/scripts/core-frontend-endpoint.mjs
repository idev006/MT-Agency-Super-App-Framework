// The browser endpoint of the Node core (p6vc-core /api/frontend) for every live test / tool script — ONE source: the
// trusted-endpoints contract (the Cloudflare Worker is gone, VC-ADR-056 W1). P6VC_CORE_FRONTEND_URL may override it (e.g. a
// candidate revision) but must still be a Cloud Run /api/frontend URL; http://localhost:<port>/api/frontend is accepted for
// the L1 local core (npm --prefix backend/core run dev).
import {readFileSync} from 'node:fs';

const CONTRACT = new URL('../../../contracts/trusted-endpoints.v1.json', import.meta.url);
const VALID = /^(https:\/\/[a-z0-9.-]+\.run\.app|http:\/\/(localhost|127\.0\.0\.1):[0-9]{2,5})\/api\/frontend$/;

export function coreFrontendEndpoint(env = process.env) {
  const override = env.P6VC_CORE_FRONTEND_URL;
  const url = override || (JSON.parse(readFileSync(CONTRACT, 'utf8')).endpoints.find(e => e.id === 'cloud-run-core')?.url || '') + '/api/frontend';
  if (!VALID.test(url)) throw new Error('P6VC_CORE_FRONTEND_URL must be the p6vc-core /api/frontend endpoint (Cloud Run or local core)');
  return url;
}
