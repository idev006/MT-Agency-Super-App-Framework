// Process entry for a p6vc-core job (Cloud Run Job, VC-ADR-046 phase 2c):  node src/job.mjs <job-name>
// Dry run unless P6VC_JOB_MODE=APPLY. Config comes only from the environment (Firestore project; the bridge secret by name).
// Prints one line: JOB {...report}. Exit 0 = PASS, 1 = PARTIAL / failed, 2 = unknown job.
import {JOBS} from './facade/jobs.mjs';
import {createIntegrationManager} from './adapters/outbound/manager.mjs';
import {firestoreStoreFromEnv} from './server.mjs';
import {randomBytes} from 'node:crypto';
import {createNodePasswordHasher} from './adapters/security/password-hasher.mjs';

const name = process.argv[2];
// R11 admin tools: everything from the environment the manual workflow sets (the password + pepper as mounted secrets)
const env = process.env;
const adminTool = name !== 'admin-tools' ? undefined : {mode: env.P6VC_ADMIN_TOOL_MODE || '', approval: env.P6VC_ADMIN_TOOL_APPROVAL || '',
  passwords: createNodePasswordHasher({pepper: env.P6VC_AUTH_PEPPER || null}), pepperConfigured: Boolean(env.P6VC_AUTH_PEPPER),
  id: () => randomBytes(32).toString('hex'),
  input: {username: env.P6VC_ADMIN_USERNAME || '', idleMinutes: env.P6VC_ADMIN_IDLE_MINUTES || '30', expectedUserId: env.P6VC_ADMIN_EXPECTED_USER_ID || '',
    runLabel: env.P6VC_ADMIN_RUN_LABEL || '', tempPassword: env.P6VC_ADMIN_TEMP_PASSWORD || ''}};
if (!Object.prototype.hasOwnProperty.call(JOBS, name)) { console.error(JSON.stringify({event: 'job', status: 'UNKNOWN_JOB'})); process.exit(2); }
try {
  const report = await JOBS[name]({store: firestoreStoreFromEnv()(),
    media: name === 'reference-seed' || name === 'admin-tools' ? undefined : createIntegrationManager().gateway('media-bridge'), adminTool,
    apply: process.env.P6VC_JOB_MODE === 'APPLY', mode: process.env.P6VC_JOB_MODE || 'DRY_RUN',
    approval: process.env.P6VC_REFERENCE_SEED_APPROVAL || '', nowMs: Date.now()});
  console.log('JOB ' + JSON.stringify({event: 'job', job: name, ...report}));
  process.exit(report.status === 'PASS' ? 0 : 1);
} catch (e) {
  console.error('JOB ' + JSON.stringify({event: 'job', job: name, status: 'FAILED', code: String(e?.message || 'JOB_FAILED').slice(0, 64)}));
  process.exit(1);
}
