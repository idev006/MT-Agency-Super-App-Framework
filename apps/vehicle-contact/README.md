# P6 Vehicle Contact — App 001

**Application:** `apps/vehicle-contact/`
**Current verified baseline:** handoff PR **#111**, merged `main` @ **`ad7630e`**; implementation/content baseline PR **#110** @ **`bf3553d`**; 2026-11-22 09:17 Asia/Bangkok
**Status:** DEV engineering verified; **not production-ready or release-approved**.

P6 Vehicle Contact lets authorized personnel register a vehicle and responsible contact, issue an opaque QR, resolve a vehicle by QR or plate/province search, view permitted details and initiate contact. QR references do not contain names or telephone numbers; possession of an identifier does not grant access to personal data.

## Start here

1. **[Current Delivery Status](docs/CURRENT_DELIVERY_STATUS.md)** — authoritative resume snapshot, runtime versions, verification results, next actions and QR stash recovery.
2. **[Project Handover](docs/PROJECT_HANDOVER.md)** — ready-to-paste next-AI prompt, document precedence, safety rules and current Mermaid handoff diagrams.
3. **[PM Plan / Slice Board](docs/PROJECT_MANAGEMENT_PLAN_20261121.md)** — current A–E/C6 state, dependencies, critical path and dated historical results.
4. **[Production Readiness Plan](docs/PRODUCTION_READINESS_PLAN_20261121.md)** — remaining engineering and human gates; no production claim.
5. **[Decision Log](docs/DECISION_LOG.md)** — engineering decisions and human ratifications still OPEN.

Older dated documents are evidence for their recorded scope, not current status.

## Current architecture and verified scope

- **Frontend:** Vue 3, Router, Pinia, Vite, Tailwind CSS and DaisyUI; current version **0.8.0**.
- **Backend:** Google Apps Script API (V8) with generated deployment artifacts; published Web App **V53**, backend **0.9.4**. Runtime persistence is **Firestore-only** (VC-ADR-026); `SheetStore` is retained for admin/maintenance editor tools only.
- **Edge:** Cloudflare Worker with Origin, operation/DTO allowlists and fail-closed validation.
- **Persistence/media:** **Firestore** (DEV Bangkok `asia-southeast3`, 25 logical collections) plus Google Drive media; the runtime reaches Firestore via REST + service-account OAuth. Frozen Sheets data is kept for maintenance/rollback history, not as the runtime system of record.
- **API:** **56 operations** across five roles and 20 use cases. See the [use-case and sequence SSOT](docs/use-cases/README.md), [API specification](docs/GAS_API_SPEC.md) and [canonical schema](schema/database.schema.json).
- **Verification:** offline GAS check **215/215**; G6 `verify-live-publish` chain **103/103** (11 public + 14 Worker fail-closed + 72 authenticated direct-GAS, 56/56 operations, all five roles, cleanup 7/7) + **DATA_PROOF 6/6** independent Firestore read-back. The authenticated 72-case stage is direct-GAS; the Worker has separate live fail-closed coverage.

Completed engineering source includes A1–A3, B1/B2/B4, B2b durable journaling, C1–C4, C6, E2, display repair, live automation, QR camera recovery (PR #112), Firestore F1–F4 + Phase 3 cutover, Slice A test-automation tooling, and Slice F+G (Firestore-only runtime, V53/0.9.4, live-verified). QR physical Android/iOS acceptance remains open; C5 is BLOCKED on D5+B3. Next engineering step = authorize-path round-trip tuneup (SECURITY-GATED, owner review). PDPA/security/UAT/release, browser/business acceptance, applicable decisions/ADRs and credential rotation remain OPEN; real-data go-live (#55) BLOCKED.

## Local setup

From the repository root, with Node.js meeting the frontend engine requirement:

```bash
npm --prefix apps/vehicle-contact/backend/gas ci
npm --prefix apps/vehicle-contact/frontend ci
npm --prefix apps/vehicle-contact/frontend run dev
```

Configuration and credentials are environment/profile based. Never commit or paste `.env`, `clasp`/Wrangler credentials, session tokens or private endpoint values. See [Worker setup](../../tools/p6vc-api-test-console/SETUP_TH.md) and [GAS deployment setup](docs/GAS_GITHUB_ACTIONS_DEPLOYMENT.md).

## Offline checks

```bash
npm --prefix apps/vehicle-contact/backend/gas run check
npm --prefix apps/vehicle-contact/frontend test
npm --prefix apps/vehicle-contact/frontend run build
node --test tools/p6vc-api-test-console/worker.test.mjs
```

The GAS check builds generated artifacts and runs the offline contract/security/persistence suites. Generated `.gs` output is not a second canonical source tree.

## Live DEV automation

Canonical commands, guards, reports and executed evidence are in **[LIVE_API_AUTOMATION.md](docs/LIVE_API_AUTOMATION.md)**.

```bash
npm --prefix apps/vehicle-contact/backend/gas run test:live
npm --prefix apps/vehicle-contact/backend/gas run test:live:full
```

The first command may legitimately finish `PASS_PUBLIC_ONLY` when optional authenticated credentials are absent. The full command fails closed unless its protected credentials and exact synthetic-DEV write confirmation are present. Use synthetic DEV data only; never point mutating tests at production or enable destructive retention. Optional protected GitHub test secrets are only for future manual Actions runs and do not affect the completed local result.

## Runbooks and design references

- [Live API automation, DEV reset and 25-Sheet audit](docs/LIVE_API_AUTOMATION.md)
- [GAS GitHub Actions deployment](docs/GAS_GITHUB_ACTIONS_DEPLOYMENT.md)
- [GAS Web App manifest/publication incident](docs/GAS_CLASP_WEBAPP_MANIFEST_INCIDENT_20261121.md)
- [Operation journal recovery](docs/OPERATION_JOURNAL_RECOVERY_RUNBOOK_20261121.md)
- [Sheets display-error repair and editor runbook](docs/GAS_NUMBERFORMAT_DISPLAY_CORRUPTION_INCIDENT_20261121.md)
- [Indexed-datastore decision packet](docs/E1_INDEXED_DATASTORE_MIGRATION_DESIGN_20261121.md)
- [Production sign-off dossier](docs/E3_PRODUCTION_SIGNOFF_DOSSIER_20261121.md)
- [Code map](docs/CODE_MAP_20261121.md) · [Agile Kanban](docs/AGILE_KANBAN.md)

The GitHub Actions GAS source-push workflow requires the exact per-push owner phrase **`PUSH_VEHICLE_GAS`**. A separately owner-authorized assistant `clasp` self-deploy path may be used within its approved scope. Neither path removes authorization or evidence requirements; source push/version creation and Web App publication are separate operations.
