# Notes for coding agents (P6 Vehicle Contact)

Start here before changing `apps/vehicle-contact` (owner 2026-11-26: maps so work is faster and has fewer mistakes):

- **Generated maps — always current, CI-checked** (`node scripts/gen-system-maps.mjs --check`):
  - [`apps/vehicle-contact/docs/generated/DATA_ACCESS_MAP.md`](apps/vehicle-contact/docs/generated/DATA_ACCESS_MAP.md) — which module reads / writes which Firestore table (and the reverse), the store rules that act on every write path, bulk operations.
  - [`apps/vehicle-contact/docs/generated/CHANGE_CHECKLIST.md`](apps/vehicle-contact/docs/generated/CHANGE_CHECKLIST.md) — every file to touch when adding an API operation, every hard-coded operation count, and what to deploy for a change in each folder.
- After a code change that moves a table access, an operation or a count: run `node scripts/gen-system-maps.mjs` and commit the result.
- Decisions: `apps/vehicle-contact/docs/DECISION_LOG.md` (VC-ADR-xxx). Use cases: `apps/vehicle-contact/docs/use-cases/` (validated by `scripts/validate-usecase-ssot.mjs`).
- Deploy order that has bitten before: Firestore indexes **before** the backend; the Cloudflare Worker (`tools/p6vc-api-test-console`) is a separate deploy and the live API suite does **not** go through it.
