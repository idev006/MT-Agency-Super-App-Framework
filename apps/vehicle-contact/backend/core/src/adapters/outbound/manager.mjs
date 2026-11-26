// Integration Manager (VC-ADR-047): builds every outbound gateway from ONE registry (contracts/outbound-integrations.v1.json).
// URLs come from the trusted-endpoints contract by id (no URL in code); secrets from the environment by NAME.
import fs from 'node:fs';
import {createHttpClient} from './http-client.mjs';
import {createLegacyEngineGateway} from './gateways/legacy-engine.mjs';
import {createMediaBridgeGateway} from './gateways/media-bridge.mjs';
import {assertImplements} from '../../ports/index.mjs';

const contract = name => JSON.parse(fs.readFileSync(new URL(`../../../../../contracts/${name}`, import.meta.url), 'utf8'));
const GATEWAYS = {
  'legacy-engine': ({http}) => createLegacyEngineGateway({http}),
  'media-bridge': ({http, secrets, entry}) => createMediaBridgeGateway({http, secret: secrets.P6VC_MEDIA_BRIDGE_SECRET, idempotent: entry.idempotent})
};

// overrides: {urls: {name: 'http://127.0.0.1:port'}} — local test servers only
export function createIntegrationManager({registry = contract('outbound-integrations.v1.json'), trusted = contract('trusted-endpoints.v1.json'),
  env = process.env, fetchImpl = fetch, log, overrides = {}} = {}) {
  const endpoints = new Map(trusted.endpoints.map(e => [e.id, e.url]));
  const entries = new Map();
  for (const entry of registry.integrations) {
    if (entries.has(entry.name) || !GATEWAYS[entry.name]) throw new Error('INTEGRATION_UNKNOWN:' + entry.name);
    if (!endpoints.has(entry.endpoint)) throw new Error('INTEGRATION_ENDPOINT_NOT_TRUSTED:' + entry.name);
    entries.set(entry.name, entry);
  }
  const built = new Map();
  function gateway(name) {
    if (built.has(name)) return built.get(name);
    const entry = entries.get(name);
    if (!entry) throw new Error('INTEGRATION_UNKNOWN:' + name);
    const local = overrides.urls?.[name];
    if (local !== undefined && !/^http:\/\/127\.0\.0\.1:\d{2,5}$/.test(local)) throw new Error('INTEGRATION_OVERRIDE_NOT_LOCAL:' + name);
    const http = createHttpClient({name, url: local || endpoints.get(entry.endpoint), timeoutMs: entry.timeoutMs,
      retry: entry.retry, breaker: entry.breaker, fetchImpl, ...(log ? {log} : {})});
    const secrets = Object.fromEntries((entry.secrets || []).map(k => [k, env[k]]));
    const g = assertImplements(entry.port, GATEWAYS[name]({http, secrets, entry}));
    built.set(name, g);
    return g;
  }
  return Object.freeze({gateway, names: () => [...entries.keys()]});
}
