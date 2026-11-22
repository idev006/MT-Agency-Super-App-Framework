# P6 Vehicle Contact — Owner Decision Briefing (one sitting)

**Document ID:** P6VC-DEC-BRIEF-001 | **Date:** 2026-11-22 (Asia/Bangkok) | **Classification:** DECISION-READINESS BRIEFING — prepared by assistant, **NOT self-approved**.
**Source baseline:** `main` @ `45fdf7c` (PR #115). **Runtime:** GAS Web App V48 / backend 0.9.1, Frontend 0.8.0, Worker live.
**Companions:** [E3 sign-off dossier](E3_PRODUCTION_SIGNOFF_DOSSIER_20261121.md) (the sign-off *record*), [E1 datastore packet](E1_INDEXED_DATASTORE_MIGRATION_DESIGN_20261121.md), [Decision log](DECISION_LOG.md), [Production readiness plan](PRODUCTION_READINESS_PLAN_20261121.md), [QR device plan](QR_DEVICE_ACCEPTANCE_PLAN_20261122.md).

## 0. Why this page exists + honest boundary

Engineering is live, hardened and evidenced (97/97 live API, 56/56 operations, independent Sheets data audit 25/25 with 0 errors). The **critical path is no longer engineering** — it is a small set of **human decisions and sign-offs** that are currently scattered across several documents. This page collects them into **one actionable sheet** so the Owner can decide in a single sitting.

**Hard rule (PM plan):** *"None may be self-approved by an assistant."* The assistant prepares options, recommendations and evidence. **Only a named human can ratify a decision or sign a gate.** "OK" / "you choose" in chat is **not** a recorded ratification of a security/PDPA/destructive decision; the Owner must record the choice (here → `DECISION_LOG.md` + the E3 sign-off table) with name, date and rationale. The assistant will not mark any item below approved on its own.

## 1. Decision sheet (ratify or reject each)

| ID | Decision | Options | Assistant recommendation | Status | Owner action |
|---|---|---|---|---|---|
| **D-E1** | Initial-production datastore scale | (1) Bounded-volume **Sheets** + caps/monitoring · (2) **Firestore** migration project | **Option 1** for the 48h target; gated migration path to Option 2 later | OPEN | Choose 1 or 2; if 1, ratify volume caps + latency/quota threshold (§2.1) |
| **D3** | Remaining phase sequencing | Phase 0→1→2→3→4 (primary journey first, retention last) | **As recommended** — retention/destructive work stays last | OPEN | Confirm order; confirm C5 stays last until D5+B3 (§2.2) |
| **D5** | Enable destructive retention | (a) Keep **disabled** · (b) Enable **synthetic-DEV rehearsal only**, gated + runbook · (c) real data | **(b)** synthetic-only, two-person, `legal_hold`; real data **never** without separate approval | OPEN | Choose a/b/c; (c) requires a separate real-data authorization (§2.3) |
| **B3** | Retention scheduler/notification **business mapping** | Define `due_at` rule, who is notified, cadence, archive-vs-delete | Owner/DPO defines the business rule; assistant implements after ratification | **BLOCKED — owner mapping** | Supply the mapping (§2.4); unblocks C5 together with D5 |
| **VC-ADR-014** | OWNER scoped read `vehicle.own.read` (`vehicles.listMine`/`changes.listMine`) | Ratify least-privilege scoped permission **vs** reuse `vehicle.change.submit` | **Ratify** as implemented (server-side identity filter, no client ownerId) | IMPLEMENTED — security ratification PENDING | Security reviewer ratifies (§3) |
| **VC-ADR-015** | RETENTION_WORKER scoped read `retention.listExecutable` | Ratify worker-scoped op **vs** grant `retention.read` to worker | **Ratify** as implemented (worker sees only executable jobs, never approve UI) | IMPLEMENTED — security ratification PENDING | Security reviewer ratifies (§3) |
| **VC-ADR-017** | C6 admin registry `vehicle.list` (SYSTEM_ADMIN + REGISTRATION_ADMIN) | Ratify admin-only bulk read **vs** restrict further | **Ratify** as implemented (minimal non-PII projection, ACTIVE-only, no contacts/owner id) | IMPLEMENTED — security/PDPA ratification PENDING | Security + PDPA reviewers ratify (§3) |

## 2. Decision detail (the choices that need informed input)

### 2.1 D-E1 — bounded Sheets vs indexed store (two paths)
- **Option 1 (recommended):** ship the already-live, hardened Sheets backend for initial production. Accept the O(rows) read ceiling **under explicit caps**. Owner ratifies: active vehicle row cap (proposed ≤ 5,000), reference catalog cap (proposed ≤ 1,000), retention/archive cadence that keeps the active set under cap, and a p95-latency / Sheets-quota threshold that triggers a migration review. Zero migration risk; matches the no-join directive; fastest for 48h.
- **Option 2:** approve a **separate** Firestore migration project (design ready in [E1 §5](E1_INDEXED_DATASTORE_MIGRATION_DESIGN_20261121.md)): dual-write journal → checksum backfill → flag cutover → rollback window → full re-test. New PDPA + security review for the new store. **Not achievable inside 48h.**
- Full pros/cons: [E1 §3–4](E1_INDEXED_DATASTORE_MIGRATION_DESIGN_20261121.md). **Assistant does not pick the scale policy; the Owner ratifies numbers.**

### 2.2 D3 — sequencing
Primary journey and REGADMIN/OWNER screens are delivered. Recommended remaining order: **B2b durable journaling (engineering) → human acceptance → retention (C5) last**, because retention is destructive. Confirming D3 keeps C5 blocked until D5+B3 are actually ratified. See [PM plan](PROJECT_MANAGEMENT_PLAN_20261121.md).

### 2.3 D5 — destructive retention enable
Destructive execution is **disabled by default** (`allowDestructiveRetention=false`). Recommended: enable **synthetic-DEV rehearsal only** under the existing gate, two-person control (SYSADMIN approves, WORKER executes), `legal_hold` respected, with the [recovery runbook](OPERATION_JOURNAL_RECOVERY_RUNBOOK_20261121.md). **Real-data deletion is never enabled by this briefing** and needs its own explicit authorization + PDPA sign-off. C5 console implementation may only start after **D5 + B3**.

### 2.4 B3 — retention business mapping (owner/DPO input required)
The mechanism exists; the **business rule** does not. Owner/DPO must define: how `due_at` is computed (retention period per data class), who is notified before deletion and how, the archive-vs-delete policy, and the cadence. This is a business/DPO decision, not an engineering default. Until ratified, **C5 stays blocked**. Cross-ref [PDPA retention gate](PDPA_DATA_RETENTION_AND_RELEASE_GATE.md), [VC-ADR-007](DECISION_LOG.md) (retention schedule OPEN).

## 3. The four human sign-offs (E3 record)

These are **separate from the decisions above** and require named reviewers. The assistant prepares the packs; humans sign. Record results in the [E3 §4 sign-off table](E3_PRODUCTION_SIGNOFF_DOSSIER_20261121.md).

| Gate | What the reviewer accepts | Prepared pack |
|---|---|---|
| **PDPA** | Lawful basis, consent, data-subject rights, retention, ROPA, privacy notices | [PDPA governance pack](PDPA_GOVERNANCE_PACK.md), [lawful basis](PDPA_LAWFUL_BASIS_DECISION.md), [consent/rights](PDPA_CONSENT_AND_RIGHTS.md), [retention gate](PDPA_DATA_RETENTION_AND_RELEASE_GATE.md), [ROPA](PDPA_ROPA_REGISTER.md), [notices](PDPA_PRIVACY_NOTICES.md), [review checklist](PDPA_REVIEW_CHECKLIST.md) |
| **Security** | Server-authoritative RBAC + fail-closed edge as the authorization model; ratify ADR-014/015/017; secrets handling + rotation; Google-identity timing (D4 = Phase 4) | [E3 §2.2](E3_PRODUCTION_SIGNOFF_DOSSIER_20261121.md), [Decision log](DECISION_LOG.md), [E2 fail-closed evidence](E2_WORKER_FAILCLOSED_EVIDENCE_20261121.md) |
| **UAT** | Browser/business acceptance of delivered journeys (gallery/copy, C1–C4, C6) on live DEV with synthetic accounts; **physical QR device acceptance** | [QR device plan](QR_DEVICE_ACCEPTANCE_PLAN_20261122.md), C1–C4/C6 evidence in [status §7](CURRENT_DELIVERY_STATUS.md) |
| **Release** | D-E1 resolved; RC build + Pages/Worker/GAS publish checklist + rollback plan; D3/D5/B3 ratified; `ENFORCED` catalog mode separately gated (currently `ADVISORY`) | [Production readiness plan](PRODUCTION_READINESS_PLAN_20261121.md), [E3 §2.4](E3_PRODUCTION_SIGNOFF_DOSSIER_20261121.md) |

## 4. Human acceptance actions (cannot be done by the assistant)

1. **Physical QR device acceptance** — minimum **D1 (Android Chrome) + D3 (iOS Safari)**, all A1–A10 PASS, sanitized evidence, named reviewer. The assistant cannot emulate a real phone camera. Protocol + evidence template: [QR device plan](QR_DEVICE_ACCEPTANCE_PLAN_20261122.md). Offline 16/16 QR + 192/192 FE tests are necessary but **not sufficient**.
2. **Browser/business walkthrough** — 5-role × use-case on live DEV (synthetic accounts), including gallery/copy UX, C1–C4 and C6 screens. API automation is **not** UAT approval.
3. **Credential rotation** — rotate release credentials and confirm the approved handling process (DEV creds only in gitignored `.env` / protected secrets; clasp/wrangler in named profiles/OAuth, never in repo). Successful tests do **not** close this.

## 5. What the assistant does AFTER each decision (consequence map)

| If the Owner… | Then the assistant… |
|---|---|
| Ratifies **D-E1 Option 1** + caps | Wires cap/monitoring assertions + documents the accepted ceiling; no migration |
| Approves **D-E1 Option 2** | Opens a **separate** Firestore migration project (not in 48h); re-opens persistence gates |
| Ratifies **D5 (synthetic-only) + B3 mapping** | Unblocks **C5**: builds the permission-gated RETENTION_WORKER console + synthetic two-person/`legal_hold` rehearsal; real data stays disabled |
| Ratifies **ADR-014/015/017** | Records ratification in `DECISION_LOG.md` with reviewer/date; no code change (already implemented) |
| Signs **PDPA/Security/UAT/Release** | Proceeds with RC publish per the readiness plan; until then, no production release |
| Records **QR D1+D3 PASS** | Closes the QR device gate; any FAIL opens a defect slice |

## 6. Boundary

This briefing **presents** choices and recommendations; it **approves nothing**. Decisions D-E1/D3/D5/B3, ratifications VC-ADR-014/015/017, the four sign-offs, physical-device/browser acceptance and credential rotation remain **OPEN human gates**. The assistant will not self-approve them, will not start C5 before D5+B3, will not enable real-data destructive retention, and will not publish a production release without the recorded human approvals above.