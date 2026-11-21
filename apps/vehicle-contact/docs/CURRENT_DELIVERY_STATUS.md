# P6 Vehicle Contact — Current Delivery Status / Resume Here

**Last verified:** 2026-11-21 (Asia/Bangkok)
**Implementation/runtime evidence baseline:** `main` @ `0d3b1f6` (PR #87, Backend `0.8.1`)

**Purpose:** compact continuation SSOT. Read this page first, then open only the linked evidence or active Issue needed for the next change. For the current source structure / module / operation map see [CODE_MAP_20261121.md](CODE_MAP_20261121.md). For the delivery execution plan (WBS, milestones, gates, risk, slice board) see [PROJECT_MANAGEMENT_PLAN_20261121.md](PROJECT_MANAGEMENT_PLAN_20261121.md).

## Runtime baseline

| Component | Verified development version | Evidence / endpoint |
|---|---|---|
| Frontend | `0.8.0` | [GitHub Pages](https://idev006.github.io/MT-Agency-Super-App-Framework/apps/vehicle-contact/frontend/); Pages run [44853383966](https://github.com/idev006/MT-Agency-Super-App-Framework/actions/runs/44853383966); deployed bundle verified to contain the photo gallery + `registrations.photo` |
| Cloudflare Worker | assistant self-deployed via `wrangler deploy` (commit `b08737d9`) | `p6vc-api-test-console.thaipoliceregion6.workers.dev`; `system.health` PASS through Worker (Origin-locked, correct envelope `{apiVersion,group,action,payload,requestId}`); `registrations.photo` allowlist now live |
| GAS Backend API | Live published Backend **`0.8.0`** (health-probed via Worker); source **Version 34** (Backend `0.8.1`, write-coercion fix + read tolerance) pushed, publication pending | 0.8.1 push run [44863296125](https://github.com/idev006/MT-Agency-Super-App-Framework/actions/runs/44863296125) from `0d3b1f6` ("Created version 34", 54 files); earlier published Version 33 served `0.8.0` and lacked the write fix |

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

- **Delivery execution now governed by [PROJECT_MANAGEMENT_PLAN_20261121.md](PROJECT_MANAGEMENT_PLAN_20261121.md)** (WBS A–E, milestones M0–M4, risk register, slice board). Backend `0.9.0` scoped ops (`vehicles.listMine`, `changes.listMine`, `retention.listExecutable`) are **source-complete, merged (#90), Worker-deployed, and functionally live in Web App V37**; the health-marker drift fix (`backendVersion` 0.8.1→0.9.0 + permanent contract guard) merged (#91) and **pushed as Version 38 — owner publication pending** (slice A1). Decisions [VC-ADR-014/015](DECISION_LOG.md) security ratification pending. See [scoped-ops evidence](BACKEND_SCOPED_OPS_0_9_0_EVIDENCE_20261121.md). **B1 org ancestor cycle check (D-SEQ-08) source+tests green** (7/7 + full suite 118/118), PR pending — [org cycle evidence](BACKEND_ORG_CYCLE_CHECK_EVIDENCE_20261121.md). Outstanding owner gates: publish V38 (A1); transient DEV credential for approval E2E 10/10 (A2) + scoped-ops live E2E (A3); decisions D3–D5. Frontend `my-vehicles` / change-review / worker UI remain NOT_WIRED slices (C1–C5).

- [#61 Primary journey epic](https://github.com/idev006/MT-Agency-Super-App-Framework/issues/61): registration -> approval -> QR/plate verification.
- Review-detail photo gallery slice MERGED (PR #84) and live (Frontend `0.8.0` on Pages; Worker redeployed by assistant with `registrations.photo` allowlist): truncated requestId + copy-full, hero FRONT image + 4 thumbnails via gated `registrations.photo` (permission `vehicle.registration.approve`, snapshot ownership check + access audit, memory-only rendering). Runtime write-coercion fix MERGED (PRs #86, #87, Backend `0.8.1`, GAS source Version 34). Remaining gates: owner publishes Web App **Version 34** (`0.8.1`), assistant probes health = `0.8.1` then runs the owner-approved approval E2E (repair dirty 9901/9902 + approve remaining 8 + negatives); browser acceptance still NOT RUN.
- [#17 Operator screens](https://github.com/idev006/MT-Agency-Super-App-Framework/issues/17): remaining unified detail/QR/device journey.
- [#18 QR camera integration](https://github.com/idev006/MT-Agency-Super-App-Framework/issues/18): local WIP exists but is **not merged or deployed**.

### BLOCKED / HUMAN INPUT

- The 2026-11-20 20:59 guarded DEV apply returned schema `0.3.0-draft`, `status:APPLIED`, `backupCreated:true`. The 21:00 post-apply dry-run returned `steps:[]`, `blocked:[]`; schema migration and verification gates PASS.
- The Project Owner confirmed the one-time migration approval property was disabled after use; no further schema write is authorized.
- `vc_reference_values` now holds 645 verified seed rows (`ADVISORY`). The 07:06 coercion-dirty rows were cleared by the gated 07:52 recovery; both Drive backups remain. `ENFORCED` mode and production security/PDPA/UAT/release approval remain separate and open.
- Production security/PDPA/UAT/release approval remains separate and open.

## Exact next actions

1. Owner publishes Web App **Version 34** (Backend `0.8.1`): GAS Editor → Deploy → Manage deployments → Edit → Version **34** → Deploy (same deployment/URL; F5 the editor first so the version list is current). Assistant then probes `system.health` via Worker expecting `0.8.1`.
2. ~~Owner redeploys the Cloudflare Worker~~ — DONE: assistant self-deployed via `wrangler deploy` (commit `b08737d9`); `registrations.photo` allowlist live, health PASS through Worker.
3. Run the owner-approved synthetic approval E2E through the Worker: local scratch `.tmp/p6vc-e2e-approval.mjs` (untracked; credentials ONLY via env `P6VC_ADMIN_USER`/`P6VC_ADMIN_PASS`, never persisted). First repair the two pre-fix dirty vehicles (`ฑฆ 9901`, `ฑฆ 9902`): read-tolerant `vehicles.lookup` → `vehicles.update` (rewrite `province_code` as text) → `qr.replace` (fresh token; original lost). Then approve the remaining 8 (`9903`–`9910`) → `vehicles.lookup` → `qr.resolve` (token memory-only) → negatives (`INVALID_REQUEST_STATE`, `PHOTO_NOT_FOUND`) → logout; verify 10/10; evidence doc + PR + #61 comment; delete scratch. Owner must re-supply the transient DEV credential in the new session.
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
