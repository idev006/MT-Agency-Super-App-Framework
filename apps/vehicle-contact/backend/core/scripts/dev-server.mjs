#!/usr/bin/env node
// L1 (VC-ADR-056, owner 2026-11-28: "เราควรทดสอบ FE and CoreEngine ที่ localhost มั้ย จะได้ไม่ต้องส่งขึ้นไปบ่อยๆ"): the web app
// and the Node core on this computer, with no Google / Cloudflare call and no deploy.
//   the core      — the real facade, use cases, shared flows, router checks, browser gateway (/api/frontend, CORS for localhost)
//   stub adapters — the acceptance harness's: in-memory store (one store for both engines), fake Drive (keeps the uploaded
//                   bytes), fake password hashing, synthetic users; the legacy engine answers in-process what the core has
//                   not taken over yet — exactly as production routes it
//   data          — the 645 reference rows (ReferenceSeedV1), a synthetic organization and an open campaign; real clock time
// Everything is lost when the process stops. Synthetic data only; nothing here is a production path.
//   npm --prefix apps/vehicle-contact/backend/core run dev                     (PORT=8787 by default)
//   then: VITE_CORE_API_URL=http://localhost:8787/api/frontend npm --prefix apps/vehicle-contact/frontend run dev
import http from 'node:http';
import {createAcceptanceHarness, SAMPLE_PASSWORD} from '../tests/support/core-harness.mjs';
import {createCoreHandler} from '../src/server.mjs';
import {REFERENCE_SEED_V1} from '../../gas/src/domain/reference/ReferenceSeedV1.js';

const port = Number(process.env.PORT || 8787);
const h = createAcceptanceHarness({allowSystemReset: true});
for (const row of REFERENCE_SEED_V1.rows) h.store.insert('vc_reference_values', {...row});

// set-up uses the harness's pre-issued sessions, which belong to its fixed test clock — so it runs before real time starts
const organizationId = await h.createOrganization();
const campaign = (await h.as('sys', 'campaigns.create', {startsAt: new Date(Date.now() - 3600e3).toISOString(),
  endsAt: new Date(Date.now() + 30 * 86400e3).toISOString(), maxSubmissions: 50})).data;
// the synthetic users have no organization; give them the synthetic one so the screens that need it work
for (const u of h.store.list('vc_users')) h.store.update('vc_users', {user_id: u.user_id}, {org_id: organizationId});
const tick = () => h.setTime(new Date().toISOString()); // from here on: real time (people sign in through the web app)
tick(); setInterval(tick, 1000).unref();

const handler = createCoreHandler({legacy: {dispatch: async (e, m) => h.dispatch(e, m)}, core: h.core});
const server = http.createServer(handler).listen(port, '127.0.0.1', () => {
  const at = server.address().port; // PORT=0 → a free port (the smoke test uses it)
  console.log(`P6VC local core (stub adapters, in memory): http://localhost:${at}/api/frontend`);
  console.log(`  web app: VITE_CORE_API_URL=http://localhost:${at}/api/frontend npm --prefix apps/vehicle-contact/frontend run dev`);
  console.log('  sign in as sys | reg | staff | owner | worker — password: SAMPLE_PASSWORD in backend/gas/tests/acceptance-fixture.mjs');
  console.log(`  campaign token for the public form: ${campaign?.campaignToken || '(campaign not created)'}`);
  console.log(`  core answers ${h.core.operations.length} operations; the rest by the legacy engine in this process`);
});
void SAMPLE_PASSWORD; // imported so a renamed constant fails here, not silently in the printed hint
