# P6 Vehicle Contact — Current Delivery Status / Resume Here

**Last verified:** 2026-11-21 (Asia/Bangkok)
**Implementation/runtime evidence baseline:** `main` @ `b2f8a6a` (B1 #93 + B4 #94 + B2 #96 merged; Backend source `0.9.0`). Live DEV E2E **A2 10/10 + A3 70/70 (55/55 ops) PASS** — see [LIVE_DEV_E2E_EVIDENCE_20261121.md](LIVE_DEV_E2E_EVIDENCE_20261121.md).

**Purpose:** compact continuation SSOT. Read this page first, then open only the linked evidence or active Issue needed for the next change. For the current source structure / module / operation map see [CODE_MAP_20261121.md](CODE_MAP_20261121.md). For the delivery execution plan (WBS, milestones, gates, risk, slice board) see [PROJECT_MANAGEMENT_PLAN_20261121.md](PROJECT_MANAGEMENT_PLAN_20261121.md).

## Runtime baseline

| Component | Verified development version | Evidence / endpoint |
|---|---|---|
| Frontend | `0.8.0` | [GitHub Pages](https://idev006.github.io/MT-Agency-Super-App-Framework/apps/vehicle-contact/frontend/); Pages run [44853383966](https://github.com/idev006/MT-Agency-Super-App-Framework/actions/runs/44853383966); deployed bundle verified to contain the photo gallery + `registrations.photo` |
| Cloudflare Worker | assistant self-deployed via `wrangler deploy` (commit `b08737d9`) | `p6vc-api-test-console.thaipoliceregion6.workers.dev`; `system.health` PASS through Worker (Origin-locked, correct envelope `{apiVersion,group,action,payload,requestId}`); `registrations.photo` allowlist now live |
| GAS Backend API | Live published Web App **Version 37** — functionally **0.9.0** (3 scoped ops live, proven by A3 regression). `system.health` still reads `0.8.1` (stale marker); **Version 38** (marker fix, PR #91) pushed, **owner publication pending** (slice A1) | V37 published 2026-11-21 13:51; V38 source push run [44878044190](https://github.com/idev006/MT-Agency-Super-App-Framework/actions/runs/44878044190) from `3646e39`; live E2E [LIVE_DEV_E2E_EVIDENCE_20261121.md](LIVE_DEV_E2E_EVIDENCE_20261121.md) |

These are development facts, not production security, PDPA, UAT or release approval.

**Reference seed is APPLIED (2026-11-21 07:56):** after the coercion incident and two gated fixes (PRs #78, #80), recovery cleared 645 dirty rows and the checksum-approved reapply wrote 645 verified plain-text rows; post-apply preview returned `ALREADY_APPLIED`. Catalog mode is `ADVISORY`; `ENFORCED` remains separately gated. See [seed coercion incident evidence](REFERENCE_SEED_COERCION_INCIDENT_20261121.md). Remaining runtime gap: the Web App still serves Backend `0.8.0`; publish **Version 34** (`0.8.1`), which fixes the runtime `SheetStore` write coercion that blocked `vehicles.lookup` — see [SheetStore coercion fix & Sheets best practices](SHEETSTORE_COERCION_FIX_AND_SHEETS_BEST_PRACTICES_20261121.md).

## Current delivery state

### DONE-EVIDENCED

- Shared Vue shell, persisted session/transport settings, permission-driven navigation and STAFF read-only vehicle search.
- SYSTEM_ADMIN administration slices plus assisted registration intake and registration review.
- Primary-journey plan and strict QR/vehicle read contracts through the Worker; manual authenticated QR resolver is delivered.
- Protected registration reference-catalog contract: GAS `references.registration` -> Worker allowlist -> frontend Pinia/session cache -> assisted intake.
- Unit/contract/build/audit, desktop/mobile, corporate/dark and accessibility evidence for Frontend `0.6.0`; see [FE reference evidence](FRONTEND_FE_REFERENCE_CATALOG_01_EVIDENCE_20261120.md).
- Reference seed APPLIED (645 rows, `ADVISORY`) after gated coercion-incident recovery; live catalog served 77/524/16/17 via Worker.
- Owner-authorized synthetic API E2E: admin login -> campaign create -> 50 photo uploads -> **10/10 registrations `PENDING_APPROVAL`** with canonical codes + referenceVersion, idempotent replay and listPending verified; see [synthetic E2E evidence](SYNTHETIC_REGISTRATION_E2E_20261121.md).

### IN-PROGRESS

- **Delivery execution now governed by [PROJECT_MANAGEMENT_PLAN_20261121.md](PROJECT_MANAGEMENT_PLAN_20261121.md)** (WBS A–E, milestones M0–M4, risk register, slice board). **Live DEV E2E PASSED (2026-11-21):** A2 approval journey **10/10** (8 pending `ฑฆ9903`–`9910` approved + 2 pre-fix `9901`/`9902` verified; lookup + fresh QR resolve MATCH; negatives `INVALID_REQUEST_STATE`/`PHOTO_NOT_FOUND`) and A3 full regression **70/70 tests, 55/55 ops, 0 missing, 0 cleanup failed** — all 5 roles + the 3 scoped ops (`vehicles.listMine`, `changes.listMine`, `retention.listExecutable`) + FORBIDDEN negatives, against Web App V37 (functional 0.9.0). See [LIVE_DEV_E2E_EVIDENCE_20261121.md](LIVE_DEV_E2E_EVIDENCE_20261121.md). Backend `0.9.0` scoped ops merged (#90), Worker-deployed; health-marker drift fix (`backendVersion` 0.8.1→0.9.0 + permanent contract guard) merged (#91), **pushed as Version 38 — owner publication pending (A1)**. **B1 org ancestor cycle check merged (#93)** and **B4 login constant-work merged (#94)**; full GAS suite **123/123**. **B2 partial-write/deletion reconciliation + recovery — merged (#96), 7/7 journal-recovery cases + full suite green:** automatic state-driven `registrations.submit` reconciliation (D-SEQ-05), injected-failure tests proving the `assignRoles`/`registrationReview`/`executeDeletion` partial-write gaps + manual [recovery runbook](OPERATION_JOURNAL_RECOVERY_RUNBOOK_20261121.md) (D-SEQ-09), [VC-ADR-016](DECISION_LOG.md); B2b durable journaling for review/assignRoles deferred. See [journal recovery evidence](BACKEND_JOURNAL_RECOVERY_EVIDENCE_20261121.md). Decisions [VC-ADR-014/015](DECISION_LOG.md) security ratification pending. Outstanding owner gates: publish V38 (A1 → health 0.9.0); **batched B1/B4/B2 GAS push awaits `PUSH_VEHICLE_GAS`**; browser gallery acceptance; decisions D3–D5. Frontend `my-vehicles` / change-review / worker UI remain NOT_WIRED slices (C1–C5, after M0).

- [#61 Primary journey epic](https://github.com/idev006/MT-Agency-Super-App-Framework/issues/61): registration -> approval -> QR/plate verification.
- Review-detail photo gallery slice MERGED (PR #84) and live (Frontend `0.8.0` on Pages; Worker redeployed by assistant with `registrations.photo` allowlist): truncated requestId + copy-full, hero FRONT image + 4 thumbnails via gated `registrations.photo` (permission `vehicle.registration.approve`, snapshot ownership check + access audit, memory-only rendering). Runtime write-coercion fix MERGED (PRs #86, #87, Backend `0.8.1`). **Approval E2E DONE — live 10/10 through the Worker** (8 pending approved + 2 pre-fix verified via tolerant lookup; no destructive repair needed; fresh QR via `qr.replace`); negatives PASS; see [LIVE_DEV_E2E_EVIDENCE_20261121.md](LIVE_DEV_E2E_EVIDENCE_20261121.md). Remaining gates: owner publishes Web App **Version 38** (health → `0.9.0`); **browser gallery acceptance still NOT RUN**.
- [#17 Operator screens](https://github.com/idev006/MT-Agency-Super-App-Framework/issues/17): remaining unified detail/QR/device journey.
- [#18 QR camera integration](https://github.com/idev006/MT-Agency-Super-App-Framework/issues/18): local WIP exists but is **not merged or deployed**.

### BLOCKED / HUMAN INPUT

- The 2026-11-20 20:59 guarded DEV apply returned schema `0.3.0-draft`, `status:APPLIED`, `backupCreated:true`. The 21:00 post-apply dry-run returned `steps:[]`, `blocked:[]`; schema migration and verification gates PASS.
- The Project Owner confirmed the one-time migration approval property was disabled after use; no further schema write is authorized.
- `vc_reference_values` now holds 645 verified seed rows (`ADVISORY`). The 07:06 coercion-dirty rows were cleared by the gated 07:52 recovery; both Drive backups remain. `ENFORCED` mode and production security/PDPA/UAT/release approval remain separate and open.
- Production security/PDPA/UAT/release approval remains separate and open.

## Exact next actions

1. Owner publishes Web App **Version 38** (Backend `0.9.0` marker fix): GAS Editor → Deploy → Manage deployments → Edit → Version **38** → Deploy (same deployment/URL; F5 the editor first so the version list is current). Assistant then probes `system.health` via Worker expecting `0.9.0`. (V37 is already functionally 0.9.0 — proven by the live A3 regression; only the health label is stale.)
2. ~~Owner redeploys the Cloudflare Worker~~ — DONE: assistant self-deployed via `wrangler deploy` (commit `b08737d9`); `registrations.photo` allowlist live, health PASS through Worker.
3. ~~Run the owner-approved synthetic approval E2E through the Worker~~ — **DONE (2026-11-21): live 10/10 PASS.** Reusable harness committed at `apps/vehicle-contact/backend/gas/scripts/run-live-approval-e2e.mjs` (owner-dev write guard; credentials ONLY via env `P6VC_ADMIN_USER`/`P6VC_ADMIN_PASS`, never persisted). The two pre-fix vehicles (`ฑฆ9901`/`9902`) needed **no destructive repair** — tolerant `vehicles.lookup` resolves the coerced `province_code`, and `qr.replace` minted fresh tokens for verification. Remaining 8 (`9903`–`9910`) approved → lookup → QR resolve MATCH → negatives (`INVALID_REQUEST_STATE`, `PHOTO_NOT_FOUND`) → logout. Evidence: [LIVE_DEV_E2E_EVIDENCE_20261121.md](LIVE_DEV_E2E_EVIDENCE_20261121.md). `.tmp/` scratch deleted; `test-results/` gitignored.
4. Owner signs in to the frontend and accepts the gallery/copy UX on the synthetic requests; capture sanitized browser evidence.
5. Resume QR camera integration from the protected local stash, integrate current `main`, add direct adapter-cleanup tests, then run Android/iOS camera acceptance.

Catalog review and QR engineering may proceed independently; real catalog enforcement must wait for approved values and seed evidence.

## QR WIP recovery

The only current copy is local:

```text
stash@{0}: On codex/p6vc-qr-camera-scanner-20261120: wip: qr camera scanner before reference catalog
```

Safe continuation:

```powershell
git fetch origin main
git switch -c codex/p6vc-qr-camera-scanner-resume origin/main
git stash apply 'stash@{0}'
```

Resolve against current Frontend `0.6.1` or later, verify the diff, and do not drop the stash until the resumed changes are committed and pushed. Prior WIP evidence: pinned `html5-qrcode 2.3.8`, 12/12 focused tests, build and dependency audit passed; direct cleanup tests and physical Android/iOS evidence remain NOT RUN.

## Credential and deployment guardrails

- A Project Owner-managed DEV administrator credential exists out-of-band. Never copy its value into source, documentation, Issues, comments, logs or evidence.
- Do not run a privileged login workflow without its explicit workflow confirmation. Do not publish credential-bearing output.
- GAS source push still requires the exact owner phrase `PUSH_VEHICLE_GAS`; source version creation is not Web App publication.
- Frontend authorization is never inferred from role names; navigation uses permissions returned by GAS, while GAS remains the authorization authority.

## Resume checklist

- Confirm `git status`, `origin/main` and the live Issue labels before work.
- Use [#61](https://github.com/idev006/MT-Agency-Super-App-Framework/issues/61) as the primary-journey epic and [Agile Kanban](AGILE_KANBAN.md) for live lane filters.
- Open detailed evidence only for the slice being changed; do not re-read the full historical handover unless reconciling an old decision.
- Record exact component versions, commit/PR, tests, deployment and residual blockers after every delivered slice.
