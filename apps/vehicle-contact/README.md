# P6 Vehicle Contact — App 001

**Application:** `apps/vehicle-contact/`
**Status:** DEV / synthetic data only — not production-ready or release-approved. Current versions and the last proof live in ONE place: [CURRENT_DELIVERY_STATUS.md](docs/CURRENT_DELIVERY_STATUS.md) (this page does not repeat them).

Authorized personnel register a vehicle and its responsible contact, issue an opaque QR, find a vehicle by QR or plate, see the permitted details and call the contact — "สแกน QR รู้ผู้รับผิดชอบ กดโทรได้ทันที". A QR holds no name or phone number.

## Start here

1. [CURRENT_DELIVERY_STATUS.md](docs/CURRENT_DELIVERY_STATUS.md) — what runs now, versions, last proof, work in flight.
2. [PROJECT_HANDOVER.md](docs/PROJECT_HANDOVER.md) — next-AI prompt, owner rules, code layout, how to move an operation to the core, deploy + proof.
3. [ROADMAP.md](docs/ROADMAP.md) (order, one issue each) · [KANBAN_BOARD.md](docs/KANBAN_BOARD.md) (drawn from the issues) · [DECISION_LOG.md](docs/DECISION_LOG.md) (VC-ADR + evidence).
4. Generated, CI-checked code maps: [DATA_ACCESS_MAP](docs/generated/DATA_ACCESS_MAP.md) · [CHANGE_CHECKLIST](docs/generated/CHANGE_CHECKLIST.md). Everything dated (`*_2026xxxx.md`) proves only its own date.

## Shape (VC-ADR-056)

```
frontend/ (Vue shell: screens + on-device photo work) ──► backend/core (p6vc-core, Node, all operations) ──► Firestore
        └── photos shown straight from Drive links          └──► GAS image manager (signed bridge, clasp) ──► Google Drive
```

- `backend/core` — the backend: async Node on Cloud Run. Operations not yet moved are still answered by the frozen legacy engine (`backend/gas/src` on Cloud Run `p6vc-api`) until N4.
- `backend/gas` — shared rules still used by the core, the legacy engine, and the GAS image manager (managed with `clasp`; being reduced to the bridge only, G1).
- `tools/p6vc-api-test-console` — the old Cloudflare Worker, being retired (W1).

## Run it on this computer (no deploy)

```bash
npm --prefix apps/vehicle-contact/backend/core run dev
VITE_CORE_API_URL=http://localhost:8787/api/frontend npm --prefix apps/vehicle-contact/frontend run dev
```
The real core with stub adapters (in memory, synthetic users and data) — details: [PROJECT_HANDOVER.md §4b](docs/PROJECT_HANDOVER.md).

## Checks

```bash
npm --prefix apps/vehicle-contact/backend/core test          # core + generated legacy acceptance copies
npm --prefix apps/vehicle-contact/backend/gas run check       # legacy engine + shared rules
npm --prefix apps/vehicle-contact/frontend test               # web app unit
npm --prefix apps/vehicle-contact/frontend run test:e2e       # web app e2e against the mock API (e2e/mock-api.js)
node scripts/gen-system-maps.mjs --check && node scripts/validate-ssot.mjs && node scripts/validate-usecase-ssot.mjs
```

Live proof (after a deploy, owner OK first) and the deploy chain: [PROJECT_HANDOVER.md §5](docs/PROJECT_HANDOVER.md). Never commit or paste `.env`, `clasp` credentials, keys, tokens or passwords; synthetic DEV data only.
