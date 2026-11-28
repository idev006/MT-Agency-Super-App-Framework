// Process entry for a p6vc-core job (Cloud Run Job, VC-ADR-046 phase 2c):  node src/job.mjs <job-name>
// Dry run unless P6VC_JOB_MODE=APPLY. Config comes only from the environment (Firestore project; the bridge secret by name).
// Prints one line: JOB {...report}. Exit 0 = PASS, 1 = PARTIAL / failed, 2 = unknown job.
import {JOBS} from './facade/jobs.mjs';
import {createIntegrationManager} from './adapters/outbound/manager.mjs';
import {firestoreStoreFromEnv} from './server.mjs';

const name = process.argv[2];
if (!Object.prototype.hasOwnProperty.call(JOBS, name)) { console.error(JSON.stringify({event: 'job', status: 'UNKNOWN_JOB'})); process.exit(2); }
try {
  const report = await JOBS[name]({store: firestoreStoreFromEnv()(),
    media: name === 'reference-seed' ? undefined : createIntegrationManager().gateway('media-bridge'),
    apply: process.env.P6VC_JOB_MODE === 'APPLY', mode: process.env.P6VC_JOB_MODE || 'DRY_RUN',
    approval: process.env.P6VC_REFERENCE_SEED_APPROVAL || '', nowMs: Date.now()});
  console.log('JOB ' + JSON.stringify({event: 'job', job: name, ...report}));
  process.exit(report.status === 'PASS' ? 0 : 1);
} catch (e) {
  console.error('JOB ' + JSON.stringify({event: 'job', job: name, status: 'FAILED', code: String(e?.message || 'JOB_FAILED').slice(0, 64)}));
  process.exit(1);
}
