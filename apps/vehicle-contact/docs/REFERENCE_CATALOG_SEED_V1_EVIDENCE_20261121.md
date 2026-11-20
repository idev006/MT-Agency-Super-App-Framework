# P6 Vehicle Contact — Reference Catalog Seed v1 Evidence

**Date:** 2026-11-21 (Asia/Bangkok)  
**Scope:** source implementation and Web App publication; seed rows not yet applied  
**Backend source candidate:** `0.7.0`; API remains `v1`
**GAS source:** Version 25 from `main` commit `7ba9133589a9a94ac25dbaa19e62900992a562be` contains the 645-row Backend `0.7.0` candidate

**Live Web App:** Version 26 published by the Project Owner on 2026-11-21 05:55; credential-free `system.health` verified the same day via direct GAS POST and Worker -> GAS, both returning `backendVersion:0.7.0`, `apiVersion:v1`, `status:ready`

## Delivered

- Deterministic `P6VC_REFERENCE_SEED_V1` manifest: 77 provinces, 17 DLT registration types, five approved plate types, six approved relationships, 16 advisory colors and 524 DLT-observed brands; 645 active rows total.
- Model remains user-entered. Brand and color offer defaults plus explicit custom values and remain advisory.
- `previewVehicleReferenceSeedFromEditor()` validates the manifest and target headers, reports READY/ALREADY_APPLIED/BLOCKED and returns a deterministic SHA-256 checksum without writing.
- `applyVehicleReferenceSeedFromEditor()` accepts only a Script Property whose value equals that checksum, locks the spreadsheet, creates a Drive backup, journals state, writes only an empty table, verifies all rows and consumes the one-time approval.
- Any partial/foreign content blocks instead of merging or overwriting. A write failure journals `RECOVERY_REQUIRED` and requires manual recovery.
- No public `doGet`/`doPost` operation was added. No role name is treated as authorization.

## Verification gates

| Gate | Result | Evidence |
|---|---|---|
| Approved manifest shape/counts | PASS | 645 unique rows: 77 + 17 + 5 + 6 + 16 + 524 |
| Focused seed unit tests | PASS | 6/6: deterministic preview, exact checksum, backup/journal/apply, idempotency, conflict and recovery |
| Compiled GAS preview | PASS | Layer-mirrored `.gs` entrypoint executes against canonical fake Sheets with zero writes |
| GAS build | PASS | 53 `.gs` modules + manifest; each generated module below 800 lines |
| Full backend regression | PASS | Backend `0.7.0` `npm test`, including API inventory, RBAC 5 roles × 45 protected operations, staging fixtures and compiled VM acceptance |
| Repository/use-case SSOT | PASS | 0 errors / 0 link warnings; 20 diagrams and 51/51 operations |
| GAS source push | PASS | Manual run [44831990140](https://github.com/idev006/MT-Agency-Super-App-Framework/actions/runs/44831990140): tests/build PASS, 53 generated modules + manifest, 54 files pushed, source Version 25 created |
| Web App publication | PASS | Project Owner published Version 26 on 2026-11-21 05:55; direct GAS and Worker health probes both report Backend `0.7.0` (no credentials used) |
| Live seed preview/apply | NOT RUN | Requires deployed source, sanitized preview and exact checksum-bound approval |
| `ENFORCED` mode | BLOCKED | Requires seeded catalog plus live Frontend -> Worker -> GAS acceptance and separate approval |

## Recovery / rollback

The seed is append-only into an empty table. Before writing, the installer creates a private whole-spreadsheet Drive copy and stores an internal journal containing the backup reference. It does not claim transactional rollback. On `RECOVERY_REQUIRED`, stop, inspect backup/journal and reconcile manually; never clear state and rerun blindly.

## Residual decisions

- Reviewers must confirm the official province/vehicle labels and the approved product plate/relationship terms in the PR diff.
- Seed apply starts the catalog in `ADVISORY`; it does not change `registration_reference_enforcement`.
- SYSTEM_ADMIN catalog CRUD remains a future permission-protected use case; this initial installer is trusted GAS Editor-only.

## Source-push boundary

The manual workflow used the exact Project Owner confirmation `PUSH_VEHICLE_GAS`. It replaced the target Apps Script project source with the tested 645-row Backend `0.7.0` artifact and created immutable source Version 25. It did not publish a new Web App deployment, run either seed entrypoint, set a checksum approval property or create any catalog row.

