// SIVP section 10/11: one validator for every live runner. The trusted list is the Configuration
// SSOT contracts/trusted-endpoints.v1.json. URL is parsed (never suffix/regex matched) and must
// equal a trusted endpoint exactly. P6VC_API_BASE_URL is the technology-neutral name; the legacy
// P6VC_GAS_EXEC_URL stays accepted as an alias; if both are set and differ -> fail closed.
import fs from 'node:fs';

const SSOT = JSON.parse(fs.readFileSync(new URL('../../../contracts/trusted-endpoints.v1.json', import.meta.url), 'utf8'));
export const TRUSTED_ENDPOINTS = Object.freeze(SSOT.endpoints.map(e => Object.freeze({...e})));

export function validateTrustedEndpoint(raw, trusted = TRUSTED_ENDPOINTS) {
  if (typeof raw !== 'string' || !raw) throw new Error('ENDPOINT_MISSING');
  let u;
  try { u = new URL(raw); } catch { throw new Error('ENDPOINT_UNPARSEABLE'); }
  if (u.protocol !== 'https:') throw new Error('ENDPOINT_NOT_HTTPS');
  if (u.username || u.password) throw new Error('ENDPOINT_HAS_CREDENTIALS');
  if (u.port) throw new Error('ENDPOINT_HAS_PORT');
  if (u.search || raw.includes('?')) throw new Error('ENDPOINT_HAS_QUERY');
  if (u.hash || raw.includes('#')) throw new Error('ENDPOINT_HAS_FRAGMENT');
  const normal = u.origin + (u.pathname === '/' ? '' : u.pathname);
  const hit = trusted.find(e => e.url === normal);
  if (!hit) throw new Error('ENDPOINT_NOT_TRUSTED');
  return {url: hit.url, kind: hit.kind, id: hit.id};
}

export function resolveApiBaseUrl(env = process.env, trusted = TRUSTED_ENDPOINTS) {
  const neutral = env.P6VC_API_BASE_URL, legacy = env.P6VC_GAS_EXEC_URL;
  if (neutral && legacy && neutral !== legacy) throw new Error('CONFLICTING_API_BASE_URL');
  return validateTrustedEndpoint(neutral || legacy, trusted);
}
