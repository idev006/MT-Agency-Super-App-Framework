# P6 Vehicle Contact — Current Delivery Status / Resume Here

**Last verified:** 2026-11-21 (Asia/Bangkok)
**Implementation/runtime evidence baseline:** `main` @ `2b32c18` (PR #76)

**Purpose:** compact continuation SSOT. Read this page first, then open only the linked evidence or active Issue needed for the next change.

## Runtime baseline

| Component | Verified development version | Evidence / endpoint |
|---|---|---|
| Frontend | `0.7.0` | [GitHub Pages](https://idev006.github.io/MT-Agency-Super-App-Framework/apps/vehicle-contact/frontend/); Pages run [44832506283](https://github.com/idev006/MT-Agency-Super-App-Framework/actions/runs/44832506283) |
| Cloudflare Worker | `277b4d77-dbe4-49f9-98a5-91405a1a1fe3` | `p6vc-api-test-console.thaipoliceregion6.workers.dev`; health and fail-closed probes recorded in [FE reference evidence](FRONTEND_FE_REFERENCE_CATALOG_01_EVIDENCE_20261120.md) |
| GAS Backend API | Live API `v1`, Backend `0.7.0` via Web App **Version 26**; source Version `28` (Backend `0.7.2`) pushed but deployment not yet switched | 0.7.2 push run [44845690152](https://github.com/idev006/MT-Agency-Super-App-Framework/actions/runs/44845690152) from `3b3c6be`; 07:57 health probes (direct + Worker) still report `0.7.0`; editor entrypoints already ran HEAD 0.7.2 for recovery/apply |

These are development facts, not production security, PDPA, UAT or release approval.

**Reference seed is APPLIED (2026-11-21 07:56):** after the coercion incident and two gated fixes (PRs #78, #80), recovery cleared 645 dirty rows and the checksum-approved reapply wrote 645 verified plain-text rows; post-apply preview returned `ALREADY_APPLIED`. Catalog mode is `ADVISORY`; `ENFORCED` remains separately gated. See [seed coercion incident evidence](REFERENCE_SEED_COERCION_INCIDENT_20261121.md). Remaining runtime gap: the Web App deployment still serves Version 26 / Backend `0.7.0`; switch it to Version 28 (`0.7.2`).

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

- [#61 Primary journey epic](https://github.com/idev006/MT-Agency-Super-App-Framework/issues/61): registration -> approval -> QR/plate verification.
- Review-detail photo gallery slice (Backend `0.8.0` / Frontend `0.8.0` source): truncated requestId + copy-full, hero FRONT image + 4 thumbnails via new gated `registrations.photo` (52-operation inventory, permission `vehicle.registration.approve`, snapshot ownership check + access audit, memory-only rendering). Local gates PASS (GAS check, Worker 28, frontend 139, SSOT 52/52); awaiting `PUSH_VEHICLE_GAS`, Web App publication and browser acceptance.
- [#17 Operator screens](https://github.com/idev006/MT-Agency-Super-App-Framework/issues/17): remaining unified detail/QR/device journey.
- [#18 QR camera integration](https://github.com/idev006/MT-Agency-Super-App-Framework/issues/18): local WIP exists but is **not merged or deployed**.

### BLOCKED / HUMAN INPUT

- The 2026-11-20 20:59 guarded DEV apply returned schema `0.3.0-draft`, `status:APPLIED`, `backupCreated:true`. The 21:00 post-apply dry-run returned `steps:[]`, `blocked:[]`; schema migration and verification gates PASS.
- The Project Owner confirmed the one-time migration approval property was disabled after use; no further schema write is authorized.
- `vc_reference_values` now holds 645 verified seed rows (`ADVISORY`). The 07:06 coercion-dirty rows were cleared by the gated 07:52 recovery; both Drive backups remain. `ENFORCED` mode and production security/PDPA/UAT/release approval remain separate and open.
- Production security/PDPA/UAT/release approval remains separate and open.

## Exact next actions

1. Push Backend `0.8.0` (fresh `PUSH_VEHICLE_GAS` confirmation required; supersedes unpublished Version 28) and switch the development Web App deployment to the new version; verify health reports `0.8.0` direct and via Worker.
2. Owner signs in to the frontend again (master data loads once per sign-in) and confirms canonical province/plate/vehicle/relationship/brand/color lists on the intake form in `ADVISORY` mode; capture sanitized browser evidence.
3. Review/approve the 10 synthetic pending registrations (SPA or `registrations.review`), then continue vehicle/contact/QR creation and plate lookup per Epic #61.
4. Resume QR camera integration from the protected local stash, integrate current `main`, add direct adapter-cleanup tests, then run Android/iOS camera acceptance.
5. Continue the synthetic journey from approval -> vehicle/contact/QR -> plate lookup/QR resolve and attach recovery/denial evidence (registration leg already evidenced).

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
