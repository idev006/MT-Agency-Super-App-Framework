# P6 Vehicle Contact — Current Delivery Status / Resume Here

**Last verified:** 2026-11-21 (Asia/Bangkok)
**Implementation/runtime evidence baseline:** `main` @ `2b32c18` (PR #76)

**Purpose:** compact continuation SSOT. Read this page first, then open only the linked evidence or active Issue needed for the next change.

## Runtime baseline

| Component | Verified development version | Evidence / endpoint |
|---|---|---|
| Frontend | `0.7.0` | [GitHub Pages](https://idev006.github.io/MT-Agency-Super-App-Framework/apps/vehicle-contact/frontend/); Pages run [44832506283](https://github.com/idev006/MT-Agency-Super-App-Framework/actions/runs/44832506283) |
| Cloudflare Worker | `277b4d77-dbe4-49f9-98a5-91405a1a1fe3` | `p6vc-api-test-console.thaipoliceregion6.workers.dev`; health and fail-closed probes recorded in [FE reference evidence](FRONTEND_FE_REFERENCE_CATALOG_01_EVIDENCE_20261120.md) |
| GAS Backend API | Live API `v1`, Backend `0.7.0` via Web App **Version 26**; source Version `28` contains Backend `0.7.2` (coercion fix + real `clearContent` recovery API), not yet published | 0.7.2 push run [44845690152](https://github.com/idev006/MT-Agency-Super-App-Framework/actions/runs/44845690152) from `3b3c6be` (PRs #78, #80); 07:38 recover failed on typo'd `clearContents`, fixed in 0.7.2 with API-surface guard test |

These are development facts, not production security, PDPA, UAT or release approval.

Web App Version 26 is live with Backend `0.7.0`. The 07:06 DEV seed apply failed verification because real Sheets coerced numeric codes/ISO timestamps on write; the installer is fail-closed (backup + `RECOVERY_REQUIRED` journal, approval consumed). Backend `0.7.1` (source Version 27, PR #78) writes plain text and adds gated `recoverVehicleReferenceSeedFromEditor`; see [seed coercion incident evidence](REFERENCE_SEED_COERCION_INCIDENT_20261121.md). No valid seed row exists yet; the API/UI remain `LEGACY`.

## Current delivery state

### DONE-EVIDENCED

- Shared Vue shell, persisted session/transport settings, permission-driven navigation and STAFF read-only vehicle search.
- SYSTEM_ADMIN administration slices plus assisted registration intake and registration review.
- Primary-journey plan and strict QR/vehicle read contracts through the Worker; manual authenticated QR resolver is delivered.
- Protected registration reference-catalog contract: GAS `references.registration` -> Worker allowlist -> frontend Pinia/session cache -> assisted intake.
- Unit/contract/build/audit, desktop/mobile, corporate/dark and accessibility evidence for Frontend `0.6.0`; see [FE reference evidence](FRONTEND_FE_REFERENCE_CATALOG_01_EVIDENCE_20261120.md).

### IN-PROGRESS

- [#61 Primary journey epic](https://github.com/idev006/MT-Agency-Super-App-Framework/issues/61): registration -> approval -> QR/plate verification.
- [#17 Operator screens](https://github.com/idev006/MT-Agency-Super-App-Framework/issues/17): remaining unified detail/QR/device journey.
- [#18 QR camera integration](https://github.com/idev006/MT-Agency-Super-App-Framework/issues/18): local WIP exists but is **not merged or deployed**.

### BLOCKED / HUMAN INPUT

- The 2026-11-20 20:59 guarded DEV apply returned schema `0.3.0-draft`, `status:APPLIED`, `backupCreated:true`. The 21:00 post-apply dry-run returned `steps:[]`, `blocked:[]`; schema migration and verification gates PASS.
- The Project Owner confirmed the one-time migration approval property was disabled after use; no further schema write is authorized.
- `vc_reference_values` holds 645 coercion-dirty rows from the failed 07:06 apply; they are unusable by the catalog reader and must be cleared only through the gated recovery entrypoint. The API/UI intentionally remain `LEGACY` until recovery plus a checksum-approved reapply succeeds.
- Production security/PDPA/UAT/release approval remains separate and open.

## Exact next actions

1. Publish source Version 28 (Backend `0.7.2`) to the development Web App; verify health reports `0.7.2`. Then follow the gated recovery runbook in [seed coercion incident evidence](REFERENCE_SEED_COERCION_INCIDENT_20261121.md): fresh recovery approval -> `recoverVehicleReferenceSeedFromEditor` (`RECOVERED`, clearedCount 645) -> preview `READY` -> checksum approval -> apply `APPLIED` -> preview `ALREADY_APPLIED`. Checksum unchanged: `d561c7d6f0ed9832843c77523b324bcc916b6fb1ad569c5bc11b8d3e705846cb`.
2. Resume QR camera integration from the protected local stash, integrate current `main`, add direct adapter-cleanup tests, then run Android/iOS camera acceptance.
3. Complete one sanitized synthetic Frontend -> Worker -> GAS registration-to-QR/plate journey and attach recovery/denial evidence.

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
