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

## 5. First live Cloud Run deployment (2026-11-25)

**Deployment**
- Workflow run 45455503351 on commit `f92a75f`. Every step passed: build + tests, keyless auth, image push, deploy, health probe.
- Service: `https://p6vc-api-46858005337.asia-southeast3.run.app`, region **asia-southeast3 (Bangkok)**, backend 0.9.20.

**Measured from Thailand** (medians of 5; GAS measured in the same minute)

| Operation | Cloud Run | GAS |
|---|---|---|
| auth.session | **78 ms** (5/5) | 4,514 ms |
| vehicles.lookup (incl. audit write) | **205 ms** (5/5) | 11,442 ms (1/2 OK) |
| vehicles.detail | **255 ms** (5/5) | 11,160 ms (1/2) |
| registrations.listPending | **83 ms** | 2,320 ms |
| users.list | **194 ms** | 4,301 ms |
| campaigns.list | **104 ms** | 11,497 ms (1/2) |

**Security checks on Cloud Run**
- Login works, so the pepper from Secret Manager equals the GAS pepper.
- A wrong password returns `INVALID_CREDENTIALS`.
- After logout the same token returns `UNAUTHENTICATED` immediately, so there is no cache across instances.
- Login takes 2.1–2.9 s. That is PBKDF2 on 1 vCPU, by design (constant-work login).

**Full-inventory regression** against the Cloud Run URL (`run-live-owner-dev-regression.mjs`, which now accepts the project's run.app URL)
- 73 tests: **41 PASS / 32 FAIL**, 0 cleanup failures. p50 91 ms, p95 4.1 s (login and password changes).
- **The only root cause is photo storage.** Drive is not wired on Cloud Run, so `photos.upload` fails, then `registrations.submit` fails, and every vehicle/QR/change test that needs the approved vehicle fails after it.
- Every operation that doesn't depend on photos passed.

**Not yet proven:** the photo path, and therefore the end-to-end registration → approval → QR flow. This is the next slice: photos → Cloud Storage (Bangkok).

**Not switched:** the Worker and frontend still use GAS.

## 6. Photos through the Drive media bridge: full regression 73/73 (2026-11-25)

**What is live**
- GAS V71 = 0.9.21 (commit `8bd4b0e`): the signed media bridge (VC-ADR-034).
- Cloud Run redeployed with `MEDIA_BRIDGE_URL` and the bridge secret from Secret Manager.
- Probe with a deliberately wrong signature → `BRIDGE_UNAUTHORIZED`. This proves the GAS-side secret is set, without revealing it.

**Full-inventory regression against the Cloud Run URL**

| Run | Result | Notes |
|---|---|---|
| 1 | 42/73 | One `fetch failed` on `organizations.create`; the rest cascaded from it |
| 2 | 72/73 | One `fetch failed` on `audit.export`; **57/57 operations covered** |
| 3 (after the runner records the transport error cause) | **73/73 PASS, 57/57 covered, 0 cleanup failures** | |

**Photo SSOT check**
- Firestore `vc_vehicle_photos` has the 5 new slot rows of each run, each holding a Drive file id.
- Drive metadata (checked directly through the owner's Drive connector) for each file: in the photos folder, **owner = the project owner account**, created during the run, not trashed.

**Server-side view (Cloud Run request logs, read-only access granted by the owner)**
- Every request returned **200**. No warnings or errors. No instance crash: one instance start per deploy or idle period.
- Typical server latency is 50–250 ms. Slow requests are only:
  - logins: PBKDF2, 2–4 s, by design;
  - bridge photo operations: 4–14 s, because GAS time is the accepted trade-off of VC-ADR-034.
- Earlier "7 s lookup" figures were test-case durations that included several calls plus a login, not one lookup.

**The intermittent `fetch failed`**
- Those requests never reached Cloud Run (no log entry).
- It could not be reproduced: 18/18 calls OK at idle gaps of 2–65 s.
- Most likely a transient network path issue between the test machine and Google's front end.
- The runner now records the cause (`NETWORK_<code>` / `CLIENT_TIMEOUT_40S`).
- Browser clients already treat a network error as an uncertain outcome (reload before retrying).

**Found (pre-existing, not caused by this work):** photo files are `UNLISTED` ("anyone with the link"), inherited from the folder sharing. File links are never returned by the API, but the folder should be set to **Restricted**. That is an owner action, and the bridge keeps working because GAS acts as the owner.

**Not switched yet:** the Worker and frontend still call GAS. Switching needs SSOT scenarios + G6 against Cloud Run and owner approval.
