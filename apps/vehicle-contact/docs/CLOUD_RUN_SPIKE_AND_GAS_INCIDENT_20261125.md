# Cloud Run spike + GAS outbound incident (2026-11-25)

**Classification:** synthetic DEV evidence. This is not UAT, a security sign-off, or release approval. Real-data go-live (#55) is unchanged.

## 1. Incident: GAS → Firestore calls hang 9.5 s and fail

**Symptom**
- After V70 (0.9.20) was published, G6 and the SSOT scenarios failed.
- Login and other calls returned `OPERATION_FAILED` after 10–14 s.

**Measurements** (profiler `prof_*`, `serverTiming.fetch`)
- A failing call spends about **9.5 s on one Firestore request**, then errors.
- A good call spends 80–500 ms on the same request.
- Failure rate ranged from 9/20 to 4/4, depending on the minute.
- The OAuth token exchange shows the same pattern (`other:9508`).

**What was ruled out**

| Hypothesis | Test | Result |
|---|---|---|
| The new database `p6vc-us` | Owner switched `VEHICLE_FIRESTORE_DATABASE_ID` back to `(default)`. SSOT check: the new session landed in `(default)` (189 → 190). | Still failing → not the database |
| Firestore itself | 30 direct REST calls from Thailand to each database | 0 errors (`(default)` p50 33 ms, `p6vc-us` p50 302 ms) → Firestore is healthy |
| The V70 code | Owner-approved temporary rollback to V69, 5 logins | 2/5 failed at 9.5 s → not V70. V70 restored (health 0.9.20). |
| Google incident | status.cloud.google.com | No Firestore incident listed |

**Conclusion:** the fault is in Apps Script outbound UrlFetch.

**Most likely cause (not proven):** the Apps Script daily UrlFetch quota of a consumer account, about 20,000 calls/day.
- Many full suites ran that day, each making thousands of calls.
- Expected reset: midnight Pacific, about 15:00 Bangkok.
- The backend maps every unexpected error to `OPERATION_FAILED` and does not log it, so the exact message is unknown. A sanitized error log is a follow-up.

**Implication:** a handful of test runs can exhaust GAS for the whole region. GAS cannot carry region-wide production traffic.

## 2. Spike: the same application on Node, next to the data

- [spike-node-api-server.mjs](../backend/gas/scripts/spike-node-api-server.mjs) serves the **unchanged** Router/Controller/UseCases/FirestoreStore code over HTTP from Node, using the existing Node composition.
- The envelope is identical to GAS v1. Tests: `SPIKE-01..02`.
- Run from the developer machine in Thailand against Firestore `(default)` (Bangkok), with a real session token from a GAS login.
- Medians of 5 spike calls and 3 GAS calls, measured during the incident:

| Operation | Spike (Node → Bangkok DB) | GAS (same minute) |
|---|---|---|
| auth.session | **208 ms** (5/5 OK) | 1,963 ms (3/3) |
| vehicles.lookup (incl. audit write) | **664 ms** (5/5) | 11,936 ms (1/3 OK) |
| vehicles.detail | **624 ms** (5/5) | 8,639 ms (2/3) |
| registrations.listPending | **284 ms** (5/5) | 11,823 ms (1/3) |

Cloud Run in `asia-southeast3` (Bangkok) should be equal or faster: the server sits in the same region as the data, with no home-internet hop.

## 3. Open items before a real Cloud Run deployment

1. **Deploy tooling:** the `gcloud` CLI is not installed on this machine.
   - Option 1: the owner installs it and logs in.
   - Option 2: deploy from GitHub Actions with Workload Identity (no key files).
2. **Secrets:** the auth pepper must go into **Secret Manager**. The owner copies it from Script Properties; it is never echoed or committed.
3. **Credentials:** use the Cloud Run service identity instead of a SA key file.
4. **Session cache:** the 60 s cache (VC-ADR-030) must **not** be a per-instance memory cache. Logout on one instance would not clear another, which breaks immediate revocation. On Cloud Run the session read costs about 30 ms, so run without a cache (or use a shared store later).
5. **Concurrency:** the business code is synchronous (UrlFetch contract), so run 1 request per instance and scale instances. Moving to async I/O is a later optimization.
6. **Out of spike scope:**
   - Photos: Drive → Cloud Storage (Bangkok).
   - Campaign/registration writes: these need the real pepper and the lock semantics re-checked. Firestore transactions already provide them.

## 4. Cloud Run service (owner chose GitHub Actions deploy)

**What exists:**
- [backend/cloudrun/](../backend/cloudrun/) contains:
  - `runtime.mjs`: GAS-shaped adapters for env config, synchronous fetch, `node:crypto` utilities and the service-identity token. There is **no session cache** and **no key file**.
  - `http-handler.mjs`: same v1 envelope as GAS; never returns internal error text.
  - `server.mjs` and a `Dockerfile` (`node:22-slim`, no npm dependencies, runs as user `node`).
  - Tests: `CLOUDRUN-01..03`. They prove env config with a required pepper, read-only config with a names-only report, Firestore called with the identity token, and a second request reading Firestore again (no cache).
- The container layout was simulated locally (the same files the Dockerfile copies): imports resolve and health returns `ready`. Docker Desktop was not running, so the real image build happens in CI.
- [.github/workflows/deploy-vehicle-cloudrun.yml](../../../.github/workflows/deploy-vehicle-cloudrun.yml):
  - Manual only; confirmation phrase `DEPLOY_VEHICLE_CLOUDRUN`; `main` branch only.
  - Gate: backend tests.
  - Keyless auth via Workload Identity Federation.
  - Builds and pushes to Artifact Registry `asia-southeast3`, then deploys `p6vc-api` with: concurrency 1, 0–10 instances, 512 Mi, 60 s timeout, runtime SA, pepper from Secret Manager, `(default)` database.
  - Finishes with a health probe.
- [ops/cloudrun-setup.sh](../ops/cloudrun-setup.sh): run once by the **owner** in Cloud Shell. Idempotent. It sets up:
  - APIs and the Artifact Registry repository.
  - Runtime SA with `datastore.user` only.
  - Deployer SA with `run.admin`, `artifactregistry.writer` on the repository, and `serviceAccountUser` on the runtime SA only.
  - The OIDC provider, accepting **only** `idev006/MT-Agency-Super-App-Framework` on `refs/heads/main`.
  - The pepper secret: hidden input, never printed, stored in Bangkok, readable by the runtime SA only.

**Security posture:**
- The Cloud Run URL is public, like the GAS `/exec` URL today. Every non-public operation still requires a session and permission (unchanged application).
- The Worker remains the frontend's gateway until switch-over.

**Risk to check at the first deploy:** whether Cloud Run is available in `asia-southeast3`. If the region is refused, fall back to `asia-southeast1` (Singapore); Firestore stays in Bangkok.

**Not switched:**
- The Worker and frontend still point to GAS.
- Switching any path to Cloud Run happens only after a live G6 run against the Cloud Run URL and owner approval.
