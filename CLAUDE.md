# Notes for coding agents (P6 Vehicle Contact)

MT-Studio project profile (commands, deploy order + confirmation phrases, live-proof gates, gotchas): [`.mt-studio/project.yaml`](.mt-studio/project.yaml) — single source for those facts; owner rules L0 live in the MT-Studio-Plugin repo.

**Handing over / resuming:** read [`apps/vehicle-contact/docs/CURRENT_DELIVERY_STATUS.md`](apps/vehicle-contact/docs/CURRENT_DELIVERY_STATUS.md) (what runs now, last proof) and [`apps/vehicle-contact/docs/PROJECT_HANDOVER.md`](apps/vehicle-contact/docs/PROJECT_HANDOVER.md) (prompt, rules, code layout, how to move an operation to the Node core, deploy + proof, next actions). Order of work: [`apps/vehicle-contact/docs/ROADMAP.md`](apps/vehicle-contact/docs/ROADMAP.md).

Start here before changing `apps/vehicle-contact` (owner 2026-11-26: maps so work is faster and has fewer mistakes):

- **Generated maps — always current, CI-checked** (`node scripts/gen-system-maps.mjs --check`):
  - [`apps/vehicle-contact/docs/generated/DATA_ACCESS_MAP.md`](apps/vehicle-contact/docs/generated/DATA_ACCESS_MAP.md) — which module reads / writes which Firestore table (and the reverse), the store rules that act on every write path, bulk operations.
  - [`apps/vehicle-contact/docs/generated/CHANGE_CHECKLIST.md`](apps/vehicle-contact/docs/generated/CHANGE_CHECKLIST.md) — every file to touch when adding an API operation, every hard-coded operation count, and what to deploy for a change in each folder.
- After a code change that moves a table access, an operation or a count: run `node scripts/gen-system-maps.mjs` and commit the result.
- Decisions: `apps/vehicle-contact/docs/DECISION_LOG.md` (VC-ADR-xxx). Use cases: `apps/vehicle-contact/docs/use-cases/` (validated by `scripts/validate-usecase-ssot.mjs`).
- Node core (VC-ADR-051): operations move from the frozen legacy engine (`backend/gas/src`) into `backend/core/src/use-cases/`; the legacy acceptance tests run through the core as generated copies (`backend/core/scripts/gen-core-acceptance.mjs`, never hand-edit `tests/generated/`).
- Deploy chain: `scripts/p6vc-deploy-backend.sh` (refuses without `P6VC_OWNER_OK=MERGE_AND_DEPLOY` — set only after the owner's OK for that round).
- Deploy order that has bitten before: Firestore indexes **before** the backend. There is no Cloudflare Worker any more (retired, VC-ADR-056 W1): the web app calls the core's `/api/frontend` directly.
