# Handoff — Firestore Phase 3 continuation (synthetic DEV)

**Doc ID:** P6VC-HANDOFF-FS-PHASE3-20261123 · **Date:** 2026-11-23 (Asia/Bangkok)
**Audience:** the next AI assistant continuing this project in a fresh chat.
**Status at handoff:** V52 / `backendVersion` 0.9.3 **DEPLOYED + health-verified** (Firestore SoR + Sheets warm shadow). A **detached full live suite is RUNNING** to re-verify Phase 3 after the latency fix. Phase 3 is **NOT yet claimed green** — the suite result + independent dual-store audit are the remaining gates.
**Read first:** this doc → [CURRENT_DELIVERY_STATUS.md](CURRENT_DELIVERY_STATUS.md) → [BACKEND_FIRESTORE_LIVE_CUTOVER_EVIDENCE_20261123.md](BACKEND_FIRESTORE_LIVE_CUTOVER_EVIDENCE_20261123.md) → [FIRESTORE_CUTOVER_ROLLBACK_RUNBOOK.md](FIRESTORE_CUTOVER_ROLLBACK_RUNBOOK.md) → [DECISION_LOG.md](DECISION_LOG.md) (VC-ADR-019/020/021/022). General handoff: [PROJECT_HANDOVER.md](PROJECT_HANDOVER.md).

---

## 0. TL;DR — first actions for the next AI

1. **Check the running suite result FIRST** (detached at handoff; runner PID 20784 + auth child PID 18628 were ALIVE and GREEN):
   - **Interim result at handoff (measured):** authenticated stage **57/57 PASS, 0 FAIL** (of 72); **`REGISTRATIONS.SUBMIT` PASS at 32,125 ms** — the 0.9.3 fix WORKED (was 40,010 ms timeout at 0.9.2). Public 11/11 + Worker 14/14 PASS. **Latency still marginal:** p50 ~9.7 s, p90 ~21.8 s, p95 ~24.1 s, max **36.7 s (`REGISTRATIONS.REVIEW`, near the 40 s ceiling)**. Many write ops 15–25 s (dual-write Sheets mirror still on every write).
   - **TWO different `test-results` dirs — don't confuse them:**
     - Suite **log**: `apps/vehicle-contact/backend/gas/test-results/suite-run.log` (the auth child writes its report incrementally, NOT per-case stdout; the runner prints `FINAL {...}` + `LIVE_SUITE {...}` only at the very end).
     - Suite **aggregate report**: **`test-results/p6vc-live-api-suite.json` at REPO ROOT** (`F:\programming\police6\p6-vehicle-contact\test-results\`). Auth child report: `test-results/p6vc-live-owner-dev-regression.json` (REPO ROOT). `status:RUNNING` until the runner finishes; `finishedAt` set on completion.
   - The session-bound monitor does **not** carry across chats — read the log/report directly. **Do NOT kill a still-running suite.** If `LIVE_SUITE` is in the log / `finishedAt` set in the aggregate report, it finished. Expect overall **97/97** + cleanup 7/7 if the remaining 15 cases hold.
   - **If it finished GREEN:** proceed to Step B (export) → C (audit) → D (evidence). **Record the latency honestly** (p95 ~24 s, review 36.7 s) — functional but slow; the rollback-window dual-write clear (§4 Step E) is the next latency win.
2. **If GREEN:** fresh post-suite Sheets export → `dualstore-audit.mjs` → fill the evidence doc `SUITE_RESULTS` / `AUDIT_RESULTS` placeholders with PASS → commit + PR + merge → then the rollback-window step (§4).
3. **If STILL FAILING on latency:** read §5 (remaining levers). Do **not** over-engineer; measure first. The owner chose **GAS Firestore REST** for production (cost) — Node/Cloud Run is a documented fallback, not the selected path.
4. **Never claim Phase 3 / production PASS without the independent dual-store read-back** (owner binding directive: *API OK ≠ data proof*).
5. **Synthetic DEV only.** Real-data go-live (#55) stays **BLOCKED** (legal-counsel + DPO sign-off). PDPA does **not** block synthetic-DEV development (owner item 3, VC-ADR-022).

---

## 1. Exact current state

### Deployment (verified live)
| Item | Value |
|---|---|
| GAS Script ID | `1hgszMzlCLe5snPx7NY5fj-esZIIJDhXtiitTCXpgQRQKgqkBSXJyPvJX` |
| Worker-facing deployment | `AKfycby15c-Aux2za0BuedeIYni8-tc6rkf9ZVNmw-6ZMTgPvG9SvFjuQVSzNoMouiMhqTmxrA` → **@52** |
| @HEAD deployment | `AKfycbyHGNhn5Igq3XVAsbGj9PCWzDOlm5rFBUbAK5jbKE8K` |
| Live version | **V52 / `backendVersion` 0.9.3** · `status:ready` · `apiVersion:v1` · `releaseChannel:development` |
| Effective store | **Firestore SoR + Sheets warm shadow** (`persistence{engine:"firestore",dualWrite:true}`) |
| Source | main **`0cc74ba`** (PR #139) = 0.9.3 round-trip fix `e81a960` + connection panel `5a6d1b9` |
| Firestore DEV | project `mt-iam-core-2026`, db `(default)`, Bangkok `asia-southeast3`; SA key **outside repo** `~/.p6vc/p6vc-firestore-dev-key.json` via gitignored `.env` |
| Sheets SSOT | `17uVyxgLkWoMrqUhgRVZQFp6EFs4oWb6lw2FPKogDqEE` (25 `vc_*` tables) |
| Frontend | 0.8.0 (GitHub Pages) + post-signin connection panel (footer `<dl>`: Frontend / Backend channel / API / database + dual-write badge) |

**Script Properties flags (project-level, persist across versions):** `VEHICLE_PERSISTENCE_BACKEND=firestore`, `VEHICLE_FIRESTORE_DUALWRITE=true`. Set via GAS editor Script Properties UI. **NEVER `take_snapshot` on the GAS settings page — it exposes secret values.** Use `evaluate_script` returning property NAMES/structure only.

### Git
- Branch **main**, HEAD **`0cc74ba`** (PR #139 merged), origin/main in sync.
- At handoff there were 3 uncommitted doc edits (VC-ADR-022 + V52 deployment facts in DECISION_LOG / CURRENT_DELIVERY_STATUS / live-cutover evidence). **These are committed via the handoff PR** (see §6). If you see them uncommitted, commit them — they are verified facts, not speculation.

### Running suite (detached, survives chat switch)
- Launcher: `test-results/launch-suite.mjs` → spawns `scripts/run-live-api-suite.mjs --require-authenticated`, detached, log `test-results/suite-run.log`, PID file `test-results/suite-run.pid`.
- Gates set inline by launcher: `P6VC_ALLOW_OWNER_DEV_WRITES=RUN_SYNTHETIC_OWNER_DEV`, `P6VC_ALLOW_FIRESTORE_DEV_PROBE=RUN_SYNTHETIC_FIRESTORE_PROBE`.
- 3 stages: PUBLIC_DIRECT_GAS (11) + WORKER_FAIL_CLOSED (14) + AUTHENTICATED_FULL_INVENTORY (72, all 5 roles × 56 ops + cleanup 7).
- **At handoff:** public 11/11 PASS, worker 14/14 PASS, **authenticated 57/57 PASS so far** (of 72), `REGISTRATIONS.SUBMIT` **PASS 32.1 s**. Runner PID 20784 + auth child PID 18628 alive. Aggregate report `status:RUNNING` (repo-root `test-results/p6vc-live-api-suite.json`); auth child report `p6vc-live-owner-dev-regression.json` updated incrementally. Prior run at @51/0.9.2 FAILED 71/97 (26 cascade from one `registrations.submit` 40 s timeout) — **0.9.3 resolved the timeout**.
- **Latency caveat (record honestly):** still p50 ~9.7 s / p95 ~24 s / max 36.7 s (`REGISTRATIONS.REVIEW`). Functional, under the 40 s ceiling, but slow. The synchronous Sheets dual-write mirror is still on every write — clearing it after the rollback window (§4 Step E) is the next win. Owner chose GAS REST for cost (item 2), so this is the accepted runtime; do not over-engineer.

---

## 2. The goal (owner's words)

> "พร้อมใช้งานทุก role ทุก use cases โดยใช้ฐานข้อมูลที่ firestore (frontend just shell, GAS as main engine)" — ready for ALL roles / ALL use cases on Firestore; frontend is a thin shell, GAS is the main engine. "avoid over engineer ตอนนี้ต้องการให้ระบบทำงานได้" — make it work, no over-engineering. 48 h production-ready ambition (human gates still apply).

**Project % (last reported):** engineering ~95%; synthetic-DEV-on-Firestore ~90% (pending green suite + audit); production-ready ~65–70% (human gates open).

---

## 3. Owner's binding directives (condensed — STILL IN FORCE)

- **Language/style:** reply in **Thai**, concise, small reviewable slices. **List owner-action items every time.** Honest status — never claim PASS without proof.
- **Verification (binding):** every API call must be checked against **actually-persisted data**; full test must **audit Sheets too** (independent gviz read-back). *API OK ≠ data proof.* Extended to Firestore via independent dual-store audit.
- **SSOT (binding):** every bug + solution + best practice → a GitHub evidence doc. Docs lead the project. **Avoid cross-sheet joins** (Sheets ≠ RDBMS, latency).
- **Autonomy (expanded, binding):** "คุณทำเองได้ทุกอย่างเลย" — computer use + **automatic GitHub/Cloudflare workflows** authorized; Cloud Console browser access authorized (billing on); "อนุญาตให้คุณดำเนินการแทน" for live POC/secret entry. Self-serve GAS clasp deploy + Worker wrangler deploy.
- **GAS push gate:** each source push needs the owner to type **`PUSH_VEHICLE_GAS`** (CI `deploy-vehicle-gas.yml`, `workflow_dispatch`, main only; builds + `npm run check` + `clasp push --force` + create-version; **CI NEVER publishes**). **Publication** = `clasp update-deployment <id> -V <n>` via owner-authorized self-deploy (`approve`). Each push needs its own phrase.
- **Secrets:** SA key / pepper / tokens **NEVER** echoed, logged, committed, or written to docs/memory. Key **outside repo** (`~/.p6vc/`) via gitignored `.env`. Reports gitignored + sanitized (counters / field-NAMES only). Synthetic passwords only. Pepper rotation = owner gate. `.env` is shared SSOT (gitignored).
- **PM hard rule:** human PDPA/security/UAT/release approvals, ADR ratifications, physical-device acceptance — **"None may be self-approved by an assistant."** Owner fiat ("คำสั่งของผมอยู่เหนือทุกกฏเกณฑ์", "อนุมัติเสมอ") is recorded as **intent** (VC-ADR-020) but does **not** substitute legal/DPO sign-off for real data.
- **Concurrency rule:** **NEVER run the API suite + the frontend Firestore bridge concurrently.** An idle Vite dev server (read-only) is fine.

### Owner's latest 6 decisions (2026-11-23, recorded VC-ADR-022)
1. **`PUSH_VEHICLE_GAS`** for the 0.9.3 fix → **DONE** (V52 @52 deployed + verified).
2. **Production runtime = GAS + Firestore REST** (cost, after workplace move) — **NOT** Node/Cloud Run.
3. **PDPA must NOT block development** → clarified: blocks only **real-data go-live**, not synthetic DEV. Accepted.
4. **Production Firestore provisioning + SA-key rotation = DEFERRED** (owner decides later).
5. **Owner personally executes** ratifications (D3/D5/B3, VC-ADR-014/015/017, E3 four sign-offs) + physical QR-device acceptance, **will notify**.
6. **Rollback-window duration = assistant's recommendation** (see §4).

---

## 4. Continuation runbook (do in order)

### Step A — confirm the suite result
Read `suite-run.log` tail + `p6vc-live-api-suite.json`. Record overall pass/failed, authenticated stage, `registrations.submit` timing, cleanup residue. **If the process is still running, wait for `LIVE_SUITE` (do not kill it).** If it finished FAIL on latency again → §5.

### Step B — fresh post-suite Sheets export (secret-safe)
The audit needs a **fresh** snapshot (journal/session/idempotency rows accumulate; journal rows are **never deleted**). Pre-suite snapshot = 25 tables / 2,277 rows.
**Run the receiver + audit with cwd = `apps/vehicle-contact/backend/gas`** (Bash `dir_path`) so artifacts land in `gas/test-results/` next to the existing `snapshot.json` (the receiver/audit write **cwd-relative** `test-results/...`).
1. Start receiver: `node test-results/snapshot-receiver.mjs` (from the gas dir; listens `127.0.0.1:5179`, **180 s window**, writes gitignored `test-results/snapshot.json`, counters-only ack, then exits). Start it right before the browser export.
2. In the **logged-in Sheets browser page**, evaluate `test-results/sheets-gviz-export.js` (read-only gviz CSV per tab → POST to receiver). Returns counters only; values never enter agent context. Use the browser that holds the Google session (browser-use MCP in-app browser, or OS-level Brave via `~/.p6vc` PowerShell — see memory `reference-os-level-computer-use`). Loopback `http://127.0.0.1` is exempt from mixed-content blocking.
3. Verify ack `tables=25`, `failures={}`.

### Step C — independent dual-store audit
From the gas dir (`apps/vehicle-contact/backend/gas`):
```bash
P6VC_ALLOW_FIRESTORE_DEV_PROBE=RUN_SYNTHETIC_FIRESTORE_PROBE \
  node test-results/dualstore-audit.mjs --snapshot test-results/snapshot.json
```
Compares Firestore PRIMARY (Node SDK, typed) vs Sheets SHADOW (gviz display) per-doc by PK with type normalization + `divergenceOpen`. Require `status=PASS`, `allMatch=true`, `divergenceOpen=0`. Report: `test-results/firestore-dualstore-audit.json` (gas dir). The probe gate + SA key come from the repo-root `.env` (the script imports `load-env.mjs`).

### Step D — fill evidence + commit
- Replace `<!-- SUITE_RESULTS -->` and `<!-- AUDIT_RESULTS -->` placeholders in [BACKEND_FIRESTORE_LIVE_CUTOVER_EVIDENCE_20261123.md](BACKEND_FIRESTORE_LIVE_CUTOVER_EVIDENCE_20261123.md) with the **measured** re-run + audit results (keep the first-run FAIL as history). Update the top Status line + §0 + runbook §4 live-status line + CURRENT_DELIVERY_STATUS to **Phase 3 GREEN** only if suite + audit both PASS.
- Update VC-ADR-021 status → live-verified. Record any new bug/solution as SSOT.
- Commit on a `codex/...` branch → PR → CI → merge (owner authorized auto GitHub workflows). **Do not commit secrets / snapshot.json / reports** (gitignored).

### Step E — rollback window (owner item 6, delegated to you)
**Recommendation:** keep `VEHICLE_FIRESTORE_DUALWRITE=true` through the green suite + audit + a short **~24 h monitoring window** (p95 / quota / divergence journal). Then clear the flag via GAS editor Script Properties (secret-safe) → **Firestore-only** (drops the synchronous Sheets mirror → faster writes). Sheets retained **read-only** until owner approves decommission. **Rollback at any time** = flip `VEHICLE_PERSISTENCE_BACKEND=sheets` (Sheets stayed warm → no committed write lost). Record the recommendation + execution in the evidence doc/runbook. Task **#78** tracks this.

---

## 5. Latency — root cause + remaining levers (if still slow)

**POC-proven root cause:** Firestore REST + SA OAuth are **FAST** (~335 ms full CRUD = 9 round-trips from Node, ~25–37 ms/call, token ~59 ms warm). The ~9–40 s GAS latency = **GAS `UrlFetchApp` ≈ 1 s/call × sequential REST call count per op + V8 cold starts** — NOT Firestore/OAuth (an earlier OAuth hypothesis was disproven).

**0.9.3 fix (deployed):** gateway non-transactional `commit(ops)` + `batchGetMany` + tx prefetch; store update/remove by PK **4→2**, insert **4→3** (keeps `_seq` atomicity), `sequence()` unchanged; `users.list` N+1 **38→7**; `config.get` **2→1**; session `last_seen` de-sequenced. Offline **224/224** + round-trip regression test (insert=3/update=2/remove=2). Projected `registrations.submit` ~20–26 calls.

**Remaining levers (measure first, avoid over-engineer):**
- **Token caching across executions** (`CacheService`): each GAS execution builds a fresh gateway → one OAuth exchange/exec. Caching saves ~1 call/exec. Deferred — measure 0.9.3 live first.
- **Clear dual-write** after the window → Firestore-only (drops the Sheets mirror on every write). Biggest remaining write-latency win.
- **Production runtime fallback:** Node/Cloud Run + Firestore SDK + connection reuse (~0.7 s p50 in the #135 pipeline). **Owner chose GAS REST for cost (item 2)** — this is a documented alternative, not the selected path.

Key files: `backend/gas/src/infrastructure/persistence/firestore/FirestoreRestGateway.js`, `FirestoreStore.js`; `src/application/use-cases/IdentityOperations.js` (users.list), `AdministrationOperations.js` (config.get); `src/application/security/SessionService.js` (last_seen); `src/api/groups/system/SystemGroup.js` + `src/composition/Container.js` (health persistence block).

---

## 6. Tooling / infra facts + quirks (save time)

- **clasp:** `npx @google/clasp@3.4.1 -u p6vc <cmd>` (profile `p6vc`). Publish: `... update-deployment AKfycby15c-Aux2za0BuedeIYni8-tc6rkf9ZVNmw-6ZMTgPvG9SvFjuQVSzNoMouiMhqTmxrA -V <n>`. Run from `apps/vehicle-contact/backend/gas` (use Bash `dir_path`, cwd fluctuates between calls).
- **CI deploy:** GitHub Actions `deploy-vehicle-gas.yml`, `workflow_dispatch` input `confirmation=PUSH_VEHICLE_GAS`, **refs/heads/main only**. Creates a version; never publishes.
- **GAS exec curl quirk:** `curl -sL` returns a Google HTML interstitial, not JSON. Use **Node `fetch` with `redirect:'follow'` + `content-type: text/plain;charset=UTF-8`** → HTTP 200 JSON envelope.
- **Stale origin/main pitfall:** after a merge, `git fetch origin +refs/heads/main:refs/remotes/origin/main` (explicit refspec) to refresh.
- **node -e ESM:** needs `import` (or use `.mjs`); `require` of JSON works for snapshot introspection.
- **Bash background max:** 600000 ms (10 min) → long suites MUST use the detached launcher + log/report polling, not a foreground Bash call.
- **`.env` (repo root, gitignored):** `P6VC_GAS_EXEC_URL`, `P6VC_WORKER_FRONTEND_URL`, `P6VC_FRONTEND_ORIGIN`, `P6VC_ADMIN_USER`/`PASS`, `P6VC_TEST_USERNAME`/`PASSWORD`, `GOOGLE_APPLICATION_CREDENTIALS` (→ `~/.p6vc/p6vc-firestore-dev-key.json`), `FIRESTORE_PROJECT_ID`, `FIRESTORE_DATABASE_ID`, gates `P6VC_ALLOW_OWNER_DEV_WRITES`, `P6VC_ALLOW_FIRESTORE_DEV_PROBE`, `P6VC_ALLOW_FIRESTORE_BACKFILL`. `frontend/.env.local`: `VITE_GAS_API_URL`, `VITE_WORKER_API_URL`, `VITE_BASE_PATH`.
- **Firestore console (owner wants to view live):** `https://console.cloud.google.com/firestore/databases/-default-/data?project=mt-iam-core-2026` · `https://console.firebase.google.com/project/mt-iam-core-2026/firestore/databases/-default-/data`.
- **Store port (8 methods):** `one,list,listNewest,insert,update,remove,withLock,sequence`. Firestore: table→collection, record→doc (id=PK), `_seq` ordering, `SEQ_COLLECTION='__p6vc_seq'`. `build(gw)` uses fast path only when `gw.commit`+`gw.batchGetMany` exist (real gateway); inside `sequence()` the tx object lacks them → atomic tx path unchanged.
- **Reproduce commands:** see evidence doc §8. Backfill gate `P6VC_ALLOW_FIRESTORE_BACKFILL=RUN_FIRESTORE_BACKFILL_DEV`; runner `scripts/firestore-backfill.mjs --snapshot ... [--audit]`.

---

## 7. Open gates / owner-action items (do NOT self-approve)

- **#55 real-data go-live: BLOCKED** — named legal-counsel + DPO sign-off + PDPA dossier (retention numbers, lawful basis, ROPA, notices/consent, cloud-transfer assessment, breach SOP). Synthetic DEV does not authorize real data. "ห้ามข้อมูลจริง" in force.
- **Owner item 5 (owner will do + notify):** ratify D3/D5/B3, VC-ADR-014/015/017, E3 four sign-offs, physical QR-device acceptance.
- **Owner item 4 (deferred):** production Firestore provisioning + SA-key rotation.
- **#13 C5 RETENTION_WORKER execution console:** pending, blocked on D5+B3 ratification.
- **Rollback window duration:** delegated to assistant (item 6) — recommend ~24 h post-green, then clear dual-write.
- Docs SSOT refactor (#59/#125) awaits ratification.

## 8. Task list anchors
- **#74** Phase 3 (in_progress) — suite re-run + dual-store audit + evidence fill.
- **#54** F4 live cutover (in_progress). **#55** PDPA real-data gate (pending/BLOCKED). **#13** C5 console (pending).
- **#78** Rollback window: monitor then clear dual-write → Firestore-only (owner item 6).

---

## 9. Copy-paste prompt for the next AI

```
You are continuing the P6 Vehicle Contact project (Thai-speaking Project Owner; you act as senior engineer/Tech Lead). Repo: F:\programming\police6\p6-vehicle-contact. Reply in Thai, concise, small slices; list owner-action items every time; honest status — never claim PASS without persisted-data proof.

READ FIRST: apps/vehicle-contact/docs/HANDOFF_FIRESTORE_PHASE3_CONTINUATION_20261123.md, then CURRENT_DELIVERY_STATUS.md, BACKEND_FIRESTORE_LIVE_CUTOVER_EVIDENCE_20261123.md, FIRESTORE_CUTOVER_ROLLBACK_RUNBOOK.md, DECISION_LOG.md (VC-ADR-019/020/021/022).

STATE: Live GAS V52 / backendVersion 0.9.3 @52 is deployed + health-verified = Firestore SoR + Sheets warm shadow (persistence{engine:firestore,dualWrite:true}), main 0cc74ba (PR #139). A detached full live suite (runner PID 20784 + auth child 18628) was RUNNING and GREEN at handoff: public 11/11, worker 14/14, authenticated 57/57 PASS so far, REGISTRATIONS.SUBMIT PASS at 32.1s (the 0.9.3 fix resolved the prior 40s timeout). Latency still marginal (p50 ~9.7s, p95 ~24s, max 36.7s REGISTRATIONS.REVIEW) because the Sheets dual-write mirror is still on every write.

FIRST ACTION: check the suite result — tail apps/vehicle-contact/backend/gas/test-results/suite-run.log for "LIVE_SUITE {...}" and read the aggregate report at REPO ROOT test-results/p6vc-live-api-suite.json (F:\programming\police6\p6-vehicle-contact\test-results\), plus the auth child report test-results/p6vc-live-owner-dev-regression.json. NOTE: there are TWO test-results dirs (repo-root = suite reports; gas/test-results = suite-run.log + snapshot.json + audit). The auth child writes its report incrementally, not per-case stdout. The session monitor does not carry across chats; read the log/report directly. Do not kill a still-running suite. Expect overall 97/97 + cleanup 7/7 if the remaining cases hold.

THEN (only if suite GREEN): fresh post-suite Sheets export (cwd apps/vehicle-contact/backend/gas; start test-results/snapshot-receiver.mjs, evaluate test-results/sheets-gviz-export.js in the logged-in Sheets browser page) → run dualstore-audit.mjs --snapshot test-results/snapshot.json (gate P6VC_ALLOW_FIRESTORE_DEV_PROBE=RUN_SYNTHETIC_FIRESTORE_PROBE) → require status=PASS/allMatch/divergenceOpen=0 → fill the evidence doc SUITE_RESULTS/AUDIT_RESULTS placeholders + update status docs/VC-ADR-021 → commit on a codex/ branch + PR + merge. Then the rollback window (~24h monitoring, then clear VEHICLE_FIRESTORE_DUALWRITE → Firestore-only; task #78). Record the marginal latency honestly (p95 ~24s); clearing dual-write is the next latency win.

BINDING RULES: every API call verified against actually-persisted data (API OK ≠ data proof; audit Sheets independently via gviz). Every bug/solution/best practice → GitHub SSOT evidence doc. Avoid cross-sheet joins. Synthetic DEV ONLY — real-data go-live (#55) BLOCKED (legal/DPO sign-off; owner fiat is intent, not legal approval). PDPA does NOT block synthetic DEV (owner item 3). Secrets (SA key/pepper/tokens) NEVER echoed/logged/committed/written to docs; key outside repo ~/.p6vc via gitignored .env; reports sanitized counters/field-names only. NEVER take_snapshot on GAS Script Properties (exposes secrets) — evaluate_script names/structure only. GAS source push needs owner "PUSH_VEHICLE_GAS" (CI creates version, never publishes); publication = clasp update-deployment -V <n> (owner-authorized). Owner authorized automatic GitHub/Cloudflare workflows + computer use. NEVER run API suite + frontend Firestore bridge concurrently. Avoid over-engineering — make it work.

OWNER DECISIONS (VC-ADR-022): production runtime = GAS Firestore REST (cost, NOT Cloud Run); production Firestore provisioning + SA rotation deferred; owner personally does ratifications (D3/D5/B3, VC-ADR-014/015/017, E3) + QR device acceptance and will notify; rollback-window duration delegated to you.

GOAL: ready for ALL roles / ALL use cases on Firestore (frontend thin shell, GAS main engine). Continue effectively from the suite result. Start by checking the suite and reporting the measured outcome in Thai.
```