# P6 Vehicle Contact — Reference Catalog Seed v1 Evidence

**Date:** 2026-11-21 (Asia/Bangkok)  
**Scope:** source implementation only  
**Backend source candidate:** `0.6.0`; API remains `v1`  
**Live Backend:** `0.5.0`, GAS source Version 22 — unchanged

## Delivered

- Deterministic `P6VC_REFERENCE_SEED_V1` manifest: 77 provinces, 17 DLT registration types, five approved plate types and six approved relationships; 105 active rows total.
- Brand, model and color remain empty/advisory so the frontend keeps its existing text fallback.
- `previewVehicleReferenceSeedFromEditor()` validates the manifest and target headers, reports READY/ALREADY_APPLIED/BLOCKED and returns a deterministic SHA-256 checksum without writing.
- `applyVehicleReferenceSeedFromEditor()` accepts only a Script Property whose value equals that checksum, locks the spreadsheet, creates a Drive backup, journals state, writes only an empty table, verifies all rows and consumes the one-time approval.
- Any partial/foreign content blocks instead of merging or overwriting. A write failure journals `RECOVERY_REQUIRED` and requires manual recovery.
- No public `doGet`/`doPost` operation was added. No role name is treated as authorization.

## Verification gates

| Gate | Result | Evidence |
|---|---|---|
| Approved manifest shape/counts | PASS | 105 unique rows: 77 + 17 + 5 + 6 |
| Focused seed unit tests | PASS | 6/6: deterministic preview, exact checksum, backup/journal/apply, idempotency, conflict and recovery |
| Compiled GAS preview | PASS | Layer-mirrored `.gs` entrypoint executes against canonical fake Sheets with zero writes |
| GAS build | PASS | 53 `.gs` modules + manifest; each generated module below 800 lines |
| Full backend regression | PASS | `npm test`, including API inventory, RBAC 5 roles × 45 protected operations, staging fixtures and compiled VM acceptance |
| Repository/use-case SSOT | PASS | 0 errors / 0 link warnings; 20 diagrams and 51/51 operations |
| GAS source push | NOT RUN | Requires exact owner confirmation `PUSH_VEHICLE_GAS` |
| Web App publication | NOT RUN | Separate from source push/version creation |
| Live seed preview/apply | NOT RUN | Requires deployed source, sanitized preview and exact checksum-bound approval |
| `ENFORCED` mode | BLOCKED | Requires seeded catalog plus live Frontend -> Worker -> GAS acceptance and separate approval |

## Recovery / rollback

The seed is append-only into an empty table. Before writing, the installer creates a private whole-spreadsheet Drive copy and stores an internal journal containing the backup reference. It does not claim transactional rollback. On `RECOVERY_REQUIRED`, stop, inspect backup/journal and reconcile manually; never clear state and rerun blindly.

## Residual decisions

- Reviewers must confirm the official province/vehicle labels and the approved product plate/relationship terms in the PR diff.
- Seed apply starts the catalog in `ADVISORY`; it does not change `registration_reference_enforcement`.
- SYSTEM_ADMIN catalog CRUD remains a future permission-protected use case; this initial installer is trusted GAS Editor-only.

