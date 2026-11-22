# P6 Vehicle Contact — Docs SSOT Refactor PROPOSAL (hierarchy + de-dup + stale marking)

**Document ID:** P6VC-DOCS-REFACTOR-001 | **Date:** 2026-11-22 (Asia/Bangkok)
**Status:** **PROPOSAL — NOT EXECUTED.** This page presents a plan + tradeoffs for **owner scope confirmation before any large refactor**. It changes no runtime, no schema, no policy and no other document. Nothing here is a PDPA/security/UAT/release approval.
**Current verified baseline:** server `main` **`19f3e54`** (PR #124); GAS Web App **V49 / `backendVersion` 0.9.2**; Frontend **0.8.0**; **56 operations / 25 logical entities**; live suite **97/97**. See [CURRENT_DELIVERY_STATUS.md](CURRENT_DELIVERY_STATUS.md).
**Authority / precedent:** [ADR-002 SSOT boundaries](../../../blueprint/decisions/ADR-002-SSOT-BOUNDARIES.md) · [Document Consistency QC 2026-11-17](DOCUMENT_CONSISTENCY_QC_2026-11-17.md) · [Architecture SSOT](ARCHITECTURE_SSOT.md) · [Project Handover §2 precedence](PROJECT_HANDOVER.md).

## 1. Problem (evidence-backed, not opinion)

The docs **are** the project SSOT (owner directive: "เราใช้เอกสารนำโครงการ"). They have grown without a single map, and a few **entry/navigation** documents now contradict the verified runtime.

| Symptom | Measured evidence |
|---|---|
| Sprawl, no single index | **202** `.md` in repo (excl. `node_modules`/`.git`); **123** top-level files in `apps/vehicle-contact/docs/`; **14** `docs/evidence/*` bundles; **20** `docs/use-cases/UC-*` dirs; ~19 `blueprint/*.md`. No `docs/INDEX` or docs-map exists. |
| Stale **entry** doc — app README | [README.md](../README.md) still says "published Web App **V48**, backend **0.9.1**", baseline "PR **#111** @ `ad7630e`", and "**B2b remain open**" — but B2b is **published V49/0.9.2** and main is `19f3e54`. |
| Stale **entry** doc — handover | [PROJECT_HANDOVER.md](PROJECT_HANDOVER.md) ready-to-paste prompt + snapshot say "**V48 / 0.9.1**", "**Continue B2b** as a separate PR", baseline #111 — all superseded by #117/#118 (B2b done/live). |
| Stale **contract** doc | [GAS_API_SPEC.md](GAS_API_SPEC.md) header: "SOURCE HANDLERS **50/50** WIRED, BUT UNVERIFIED AND **NOT DEPLOYED**", table marks protected groups `DISABLED`, and §router says "**51** logical handlers" — reality is **56 ops live, 97/97**. |
| Stale **pointer text** inside otherwise-correct banners | [GAS_MODULE_MAPPING.md](GAS_MODULE_MAPPING.md) stale banner points to "current **52-module / 55-operation**" (now **56/56**); [BACKEND_SCOPED_OPS_0_9_0_EVIDENCE_20261121.md](BACKEND_SCOPED_OPS_0_9_0_EVIDENCE_20261121.md) banner says "current **V48/0.9.1**" (now V49/0.9.2). |
| Overlapping specs, no declared authority | Requirements appear in ≥6 files; architecture in ≥4; plans in ≥6; proposals in ≥4 (see §4). A reader cannot tell which one governs. |

**Already-done partial remediation (keep, do not redo):** #57 created [ARCHITECTURE_SSOT.md](ARCHITECTURE_SSOT.md) (canonical living architecture) and refreshed [CODE_MAP_20261121.md](CODE_MAP_20261121.md) to 56/56; #58 made [schema.json](../schema/database.schema.json) + [ER diagram](DATA_MODEL_ER_DIAGRAM_20261122.md) the DB-agnostic logical SSOT and labeled [GAS_DATA_MODEL.md](GAS_DATA_MODEL.md) / [FIRESTORE_PHYSICAL_MAPPING_20261122.md](FIRESTORE_PHYSICAL_MAPPING_20261122.md) as **derived**. Several evidence docs already carry "Historical snapshot" banners. This proposal **formalizes that pattern repo-wide** and fixes the remaining stale entry docs.

## 2. Proposed hierarchy (4 tiers) + status-banner convention

A document's **tier** answers "may I act on this as current truth?" Tiers are declared by a banner, **not** by moving files (see §6 for why moving is unsafe now).

| Tier | Meaning | Rule | Examples |
|---|---|---|---|
| **T0 — Entry / navigation** | Where a human or next-AI starts | Kept current; links down to T1; never a competing requirement | [README.md](../README.md), [CURRENT_DELIVERY_STATUS.md](CURRENT_DELIVERY_STATUS.md), [PROJECT_HANDOVER.md](PROJECT_HANDOVER.md), **new `DOCS_MAP.md`** |
| **T1 — Living canonical spec** | The single authority for a concern | Kept current via reviewed PRs; one authority per concern (§4) | [ARCHITECTURE_SSOT.md](ARCHITECTURE_SSOT.md), [schema.json](../schema/database.schema.json)+[ER](DATA_MODEL_ER_DIAGRAM_20261122.md), [api-inventory.v1.json](../contracts/api-inventory.v1.json), [use-cases/README.md](use-cases/README.md), [DECISION_LOG.md](DECISION_LOG.md), [APPROVED_REQUIREMENTS_BASELINE_R01_R26.md](APPROVED_REQUIREMENTS_BASELINE_R01_R26.md), [PROJECT_MANAGEMENT_PLAN_20261121.md](PROJECT_MANAGEMENT_PLAN_20261121.md), [PRODUCTION_READINESS_PLAN_20261121.md](PRODUCTION_READINESS_PLAN_20261121.md), runbooks, PDPA pack (draft) |
| **T2 — Immutable dated evidence** | Proof of a recorded date/scope only | **Never rewritten.** Counts are point-in-time; current counts supersede without erasing history (Handover §2.5) | all `*_EVIDENCE_YYYYMMDD.md`, `*_INCIDENT_*.md`, `BACKEND_ACCEPTANCE_REPORT_20261117.md`, `docs/evidence/*` |
| **T3 — Historical / superseded draft** | Kept for audit; NOT current truth | Banner + pointer to the T1 authority; retained per ADR-002 §6 / QC DOC-11 | [GAS_MODULE_MAPPING.md](GAS_MODULE_MAPPING.md), [GAS_BACKEND_ARCHITECTURE_CONFORMANCE_20261117.md](GAS_BACKEND_ARCHITECTURE_CONFORMANCE_20261117.md), [GAS_API_SPEC.md](GAS_API_SPEC.md) bootstrap table, `SYSTEM_ANALYSIS_V2.md`, `TECHNICAL_DESIGN.md` (React-era), early proposals, [API_TEST_SUITE_PHASE1.md](API_TEST_SUITE_PHASE1.md) |

**Standard banner template** (one line near the top, additive — does not delete content):

```markdown
> **Tier:** T1 living canonical | T2 dated evidence (immutable) | T3 historical/superseded
> **Last verified:** YYYY-MM-DD · **Authority for:** <concern> · **Superseded by:** <T1 link> (T3 only)
> **Scope boundary:** <what this does NOT prove / approve>
```

## 3. Docs map (classification of the 123 top-level files by cluster)

Filenames below are inline code (classification, not navigation). The executed S2 slice will turn this into a linked `DOCS_MAP.md`. **Action** key: `KEEP-T1` keep current · `BANNER-T2` mark immutable evidence · `BANNER-T3` mark historical + pointer · `REFRESH` fix stale current-state text · `INDEX` list in docs map.

| Cluster | Files (representative) | Authority (T1) | Action |
|---|---|---|---|
| Entry / status | `CURRENT_DELIVERY_STATUS`, `PROJECT_HANDOVER`, `../README`, `AGILE_KANBAN` | CURRENT_DELIVERY_STATUS (runtime) + PM plan (slices) | REFRESH handover/README; INDEX all; AGILE_KANBAN already points to live Issues |
| Architecture | `ARCHITECTURE_SSOT`, `CODE_MAP_20261121`, `GAS_MODULE_MAPPING`, `GAS_BACKEND_ARCHITECTURE_CONFORMANCE_20261117`, `FRONTEND_ARCHITECTURE`, `FRONTEND_COMPONENT_ARCHITECTURE_PATTERNS` | ARCHITECTURE_SSOT (app) + blueprint MULTILAYER (agnostic) | KEEP-T1 arch/code-map; BANNER-T3 module-mapping + conformance |
| Data model | `../schema/database.schema.json`, `DATA_MODEL_ER_DIAGRAM_20261122`, `GAS_DATA_DICTIONARY`, `GAS_DATA_MODEL`, `FIRESTORE_PHYSICAL_MAPPING_20261122`, `PHASE1_GOOGLE_SHEETS_DATA_ARCHITECTURE`, `SCHEMA_SYNC_IMPLEMENTATION`, `VEHICLE_MEDIA_STORAGE_DESIGN` | schema.json + ER (logical); Sheets/Firestore = derived | KEEP-T1 (done #58); INDEX; BANNER-T2 phase1 snapshot if dated |
| API contract | `GAS_API_SPEC`, `../contracts/api-inventory.v1.json`, `use-cases/README`+`catalog.json`, `GAS_SECURITY_AND_PRIVACY` | api-inventory.v1.json + use-cases (machine/UC truth) | REFRESH GAS_API_SPEC banner→inventory (file is validator-required, keep path) |
| Requirements | `PRODUCT_REQUIREMENTS`, `APPROVED_REQUIREMENTS_BASELINE_R01_R26`, `REQUIREMENTS_TRACEABILITY`, `traceability-matrix`, `SYSTEM_ANALYSIS_V2`, `SYSTEM_ANALYST_BASELINE_PHASE1`, `TECHNICAL_DESIGN`, `IMPLEMENTATION_READY_SPEC_PHASE1`, `IMPLEMENTATION_WORKPACKAGES_PHASE1`, `IMPLEMENTATION_TEST_MATRIX_PHASE1` | APPROVED_REQUIREMENTS_BASELINE_R01_R26 (approved) + PRODUCT_REQUIREMENTS (PRD) + REQUIREMENTS_TRACEABILITY (crosswalk) | KEEP-T1 baseline/PRD/traceability; BANNER-T3 analysis-V2/technical-design/impl-ready (React-era drafts per QC DOC-01); de-dup traceability-matrix vs REQUIREMENTS_TRACEABILITY |
| Plans / delivery | `PROJECT_MANAGEMENT_PLAN_20261121`, `PRODUCTION_READINESS_PLAN_20261121`, `DEVELOPMENT_ROADMAP_PHASE1`, `PRIMARY_WORKFLOW_DELIVERY_PLAN`, `FULL_ROLE_USECASE_IMPLEMENTATION_PLAN_20261121`, `WORLD_CLASS_TEST_SUITE_PLAN_20261122`, `TEST_AND_DELIVERY`, `API_TEST_SUITE_PHASE1` | PM plan (slice state) + readiness plan (gates) | KEEP-T1 PM/readiness/test-suite-plan; BANNER-T3 roadmap/primary-workflow/full-role/api-test-suite if superseded |
| Proposals / exec | `FORMAL_PROJECT_PROPOSAL`, `PROJECT_PROPOSAL_POLICY_DRIVEN`, `EXECUTIVE_APPROVAL_PROPOSAL_V2`, `EXECUTIVE_BRIEF` | DECISION_LOG (ratified outcomes) | BANNER-T3 (historical proposals, retained) |
| PDPA / privacy | `PDPA_GOVERNANCE_PACK`, `PDPA_CONSENT_AND_RIGHTS`, `PDPA_DATA_RETENTION_AND_RELEASE_GATE`, `PDPA_LAWFUL_BASIS_DECISION`, `PDPA_PRIVACY_NOTICES`, `PDPA_REVIEW_CHECKLIST`, `PDPA_ROPA_REGISTER` | PDPA_GOVERNANCE_PACK (umbrella) — **all DRAFT, human sign-off OPEN** | KEEP-T1 as draft pack; INDEX; never mark approved |
| Frontend standards | `FRONTEND_ENGINEERING_STANDARD`, `FRONTEND_DESIGN_SYSTEM_BLUEPRINT`, `FRONTEND_UI_UX_PRINCIPLES`, `FRONTEND_UI_COMPLIANCE_CHECKLIST`, `FRONTEND_ROLE_DELIVERY_BLUEPRINT`, `FRONTEND_REFERENCE_REGISTER` | blueprint FRONTEND_STANDARD (agnostic) + FRONTEND_ENGINEERING_STANDARD (app) | KEEP-T1; INDEX; declare precedence vs blueprint |
| Runbooks / ops | `GAS_GITHUB_ACTIONS_DEPLOYMENT`, `GAS_MIGRATION_RUNBOOK`, `GAS_ONE_TIME_ADMIN_RESET_RUNBOOK`, `GAS_STAGING_ACCEPTANCE_RUNBOOK`, `GAS_STAGING_BOOTSTRAP`, `OPERATION_JOURNAL_RECOVERY_RUNBOOK_20261121`, `LIVE_API_AUTOMATION`, `GAS_NUMBERFORMAT_DISPLAY_CORRUPTION_INCIDENT_20261121`, `GAS_CLASP_WEBAPP_MANIFEST_INCIDENT_20261121` | LIVE_API_AUTOMATION (current suite) + each runbook for its op | KEEP-T1 runbooks; BANNER-T2 incidents; INDEX |
| Backend evidence (T2) | `BACKEND_*_EVIDENCE_*`, `BACKEND_ACCEPTANCE_REPORT_20261117`, `BACKEND_DELIVERY_STATUS_20261117`, `BACKEND_SOURCE_COVERAGE_20261117`, `B2b/B1/B2/B4` evidence | CURRENT_DELIVERY_STATUS (current counts) | BANNER-T2 (immutable); fix stale pointer-text only |
| Frontend evidence (T2) | `FRONTEND_FE_*_EVIDENCE_*`, `FRONTEND_POC_EVIDENCE_20261118`, `C1–C4/C6` evidence, `FRONTEND_A11Y_*`, `FRONTEND_UI_DENSITY_P13_*`, `REFERENCE_*_EVIDENCE_*`, `docs/evidence/*` | CURRENT_DELIVERY_STATUS + respective T1 spec | BANNER-T2 (immutable) |
| Live / GAS test evidence (T2) | `LIVE_DEV_E2E_EVIDENCE_20261121`, `GAS_LIVE_API_TEST_EVIDENCE`, `GAS_HTTP_LOGIN_*`, `GAS_LIVE_OWNER_DEV_REGRESSION_20261118`, `GAS_TEST_EVIDENCE`, `SYNTHETIC_REGISTRATION_E2E_20261121`, `SHEETS_DATA_AUDIT_EVIDENCE_20261122`, `DEV_CLEAN_RESET_EVIDENCE_20261122`, `SYSTEM_AUDIT_EMPTY_REVIEW_QUEUE_20261121` | LIVE_API_AUTOMATION (current) | BANNER-T2; GAS_TEST_EVIDENCE validator-required → keep path + banner |
| QR / device | `QR_CAMERA_RECOVERY_EVIDENCE_20261122`, `QR_DEVICE_ACCEPTANCE_PLAN_20261122`, `POC_QR_SCANNER`, `QR_STICKER_COST_COMPARISON_2026-10-31` | QR_DEVICE_ACCEPTANCE_PLAN (human gate OPEN) | KEEP-T1 plan; BANNER-T2 recovery evidence; POC_QR_SCANNER validator-required |
| Reference catalog | `REFERENCE_CATALOG_SEED_PROPOSAL`, `REFERENCE_CATALOG_SEED_V1_EVIDENCE_20261121`, `REFERENCE_CATALOG_BACKEND_01_EVIDENCE_20261120`, `REFERENCE_BRAND_CATALOG_UX_01_EVIDENCE_20261121`, `REFERENCE_COLOR_MODEL_UX_01_EVIDENCE_20261121`, `REFERENCE_SEED_COERCION_INCIDENT_20261121`, `SHEETSTORE_COERCION_FIX_AND_SHEETS_BEST_PRACTICES_20261121` | schema.json `vc_reference_values` + DECISION_LOG (catalog mode ADVISORY) | BANNER-T2 evidence/incident; KEEP best-practices as T1 knowledge |
| Governance / team | `ENGINEERING_TEAM_CHARTER`, `SENIOR_THAI_LEGAL_COUNSEL_ROLE`, `WORKFLOW_SOP_POLICY_REVIEW`, `TEAM_UPSKILL_RESEARCH_2026-10-31`, `DOCUMENT_CONSISTENCY_QC_2026-11-17` | charter + QC precedent | KEEP-T1 charter; BANNER-T2 QC/upskill (dated) |
| Decisions | `DECISION_LOG`, `OWNER_DECISION_BRIEFING_20261122`, `E1_INDEXED_DATASTORE_MIGRATION_DESIGN_20261121`, `E3_PRODUCTION_SIGNOFF_DOSSIER_20261121` | DECISION_LOG (ratified) + briefing (open choices) | KEEP-T1; E1/E3 are packets, **not approvals** |

## 4. De-duplication — declare ONE authority per concern, cross-link the rest (never delete history)

Per ADR-002 §6 and QC DOC-11, compatibility pointers and historical drafts are **retained until an inbound-link audit**; deletion is out of scope. De-dup here means **declaring authority + cross-linking**, not removing files.

| Concern | Canonical authority (T1) | Derived / historical (keep, banner) |
|---|---|---|
| Logical data model | `schema/database.schema.json` + ER diagram | GAS_DATA_MODEL (Sheets projection), FIRESTORE_PHYSICAL_MAPPING (Firestore projection) — *done #58* |
| App architecture | ARCHITECTURE_SSOT | CODE_MAP (module index), GAS_MODULE_MAPPING (T3), CONFORMANCE_20261117 (T3) |
| Operation inventory | `contracts/api-inventory.v1.json` + use-cases catalog | GAS_API_SPEC (T3 bootstrap narrative → banner to inventory) |
| Approved requirements | APPROVED_REQUIREMENTS_BASELINE_R01_R26 | PRODUCT_REQUIREMENTS (PRD), REQUIREMENTS_TRACEABILITY (crosswalk), traceability-matrix (merge into crosswalk), SYSTEM_ANALYSIS_V2 / TECHNICAL_DESIGN / IMPLEMENTATION_READY_SPEC (T3 drafts) |
| Slice state | PROJECT_MANAGEMENT_PLAN_20261121 | AGILE_KANBAN (live Issues authoritative), DEVELOPMENT_ROADMAP, PRIMARY_WORKFLOW_DELIVERY_PLAN, FULL_ROLE_USECASE_IMPLEMENTATION_PLAN (T3 if superseded) |
| Release gates | PRODUCTION_READINESS_PLAN_20261121 | E3_PRODUCTION_SIGNOFF_DOSSIER (packet, not approval) |
| Current runtime/evidence | CURRENT_DELIVERY_STATUS + LIVE_API_AUTOMATION | all dated `*_EVIDENCE_*` (T2, point-in-time) |
| PDPA | PDPA_GOVERNANCE_PACK (umbrella, DRAFT) | the 6 satellite PDPA docs (cross-link, all DRAFT) |
| Frontend standard | blueprint FRONTEND_STANDARD (agnostic) + FRONTEND_ENGINEERING_STANDARD (app) | design-system blueprint, UI/UX principles, compliance checklist, role-delivery blueprint (cross-link) |

**Open de-dup question for owner:** `REQUIREMENTS_TRACEABILITY.md` vs `traceability-matrix.md` — propose consolidating into one crosswalk (keep both files, one becomes a pointer) **only after** confirming which is referenced by CI/other docs. Not executed in this proposal.

## 5. Stale-marking — concrete fix list (additive banners + current-state text only)

**Never erase dated evidence.** Only (a) add/repair banners and (b) fix **current-state** claims in T0/T1 navigation docs. Dated T2 numbers stay as recorded.

| File | Stale claim (verified) | Proposed fix |
|---|---|---|
| [README.md](../README.md) | V48/0.9.1; #111 baseline; "B2b remain open" | Refresh to V49/0.9.2, main `19f3e54`, B2b DONE/published; keep setup/commands |
| [PROJECT_HANDOVER.md](PROJECT_HANDOVER.md) | prompt + snapshot V48/0.9.1; "Continue B2b"; #111 | Refresh prompt/snapshot to current; keep precedence §2 + safety rules |
| [GAS_API_SPEC.md](GAS_API_SPEC.md) | "50/50 NOT DEPLOYED"; "51 handlers"; DISABLED table | Add T3 banner → api-inventory.v1.json (56 ops) + CURRENT_DELIVERY_STATUS; retain bootstrap table as history (validator-required path) |
| [GAS_MODULE_MAPPING.md](GAS_MODULE_MAPPING.md) | banner "52-module / 55-operation" | Correct pointer text to 56/56 (banner already T3) |
| [BACKEND_SCOPED_OPS_0_9_0_EVIDENCE_20261121.md](BACKEND_SCOPED_OPS_0_9_0_EVIDENCE_20261121.md) | banner "current V48/0.9.1" | Correct pointer text to V49/0.9.2 (evidence body stays dated) |

## 6. Migration safety & tradeoffs (the decisive constraint)

[scripts/validate-ssot.mjs](../../../scripts/validate-ssot.mjs) (read in full) enforces two things that **make mass file-moving unsafe right now**:

1. **Hardcoded required paths** — `required[]` and the GAS-compliance block demand these exist at exact paths: `docs/GAS_API_SPEC.md`, `docs/GAS_DATA_MODEL.md`, `docs/GAS_SECURITY_AND_PRIVACY.md`, `docs/GAS_TEST_EVIDENCE.md`, `docs/PRODUCT_REQUIREMENTS.md`, `docs/POC_QR_SCANNER.md`, `docs/REQUIREMENTS_TRACEABILITY.md`, `docs/DECISION_LOG.md`, app `README.md`, blueprint masters, ADR-002. Moving any of these **fails CI** unless the validator is edited in the same PR.
2. **Whole-repo link walk** — it scans **every** `.md` (202 files) and fails on any broken local link (`existsSync` relative to the doc's dir). Moving/renaming a doc breaks **all inbound links** across the repo unless every referrer is updated.

There is **no doc-registry requirement**, so **adding** an index/map and banners is CI-safe and additive.

| Option | What it does | Risk | Recommendation |
|---|---|---|---|
| **A — Additive refactor** | New `DOCS_MAP.md` + tier banners + authority cross-links + refresh stale T0/T1 text. **No file moves.** | **Low** — no path changes, link graph intact, validator untouched | **RECOMMENDED.** Delivers 90% of the clarity benefit in small CI-safe slices |
| **B — Physical reorg** | Move files into `docs/specs/`, `docs/evidence/`, `docs/archive/` subdirs | **High** — breaks `required[]` paths + 202-file link graph; needs validator edit + full inbound-link audit (ADR-002 §6 / QC DOC-11) | **DEFER.** Only after a dedicated inbound-link audit + separate owner ratification; not inside the 48h release window |
| **C — Status quo** | Do nothing | Sprawl + stale entry docs mislead the next-AI/owner; contradicts "docs lead the project" | Not recommended |

## 7. Phased execution plan (small reviewable slices, each gated)

**This PR = S1 only (the proposal).** No refactor is executed until the owner ratifies scope.

| Slice | Scope | Gate / verification | Owner touch |
|---|---|---|---|
| **S1 (this)** | Deliver this proposal | both SSOT validators PASS; CI green; docs-only | **Ratify hierarchy + Option A + no-delete policy** |
| **S2** | Add `DOCS_MAP.md` (linked tier map from §3) + banner convention; link it from README/STATUS/HANDOVER | additive; validators PASS; no moves | confirm map accuracy |
| **S3** | Refresh stale **entry** docs (§5: README, HANDOVER, GAS_API_SPEC banner) + fix stale pointer-text | validators PASS; current-state text only; T2 bodies untouched | — |
| **S4** | Apply T2/T3 banners + authority cross-links per cluster (§3/§4); consolidate traceability crosswalk if approved | validators PASS; inbound-link check per edited file | confirm de-dup question §4 |
| **S5 (optional, deferred)** | Physical reorg into subdirs (Option B) | **requires** inbound-link audit + `validate-ssot.mjs` `required[]` update + separate ratification | explicit go/no-go |

Each slice is a separate PR from fetched `origin/main`, full GAS `npm run check` + `validate-ssot.mjs` + `validate-usecase-ssot.mjs` green, CI watched, merged automatically under the granted GitHub workflow authorization, auto-Pages deploy verified. **No GAS push** (docs-only; `PUSH_VEHICLE_GAS` gate untouched). **No ENFORCED / real data.** Human PDPA/security/UAT/release/ADR/device gates remain OPEN and are never self-approved.

## 8. Owner actions / decisions needed

1. **Ratify the 4-tier hierarchy** (T0 entry / T1 living canonical / T2 immutable evidence / T3 historical) and the banner convention.
2. **Confirm Option A (additive, no file moves)** as the refactor scope; explicitly **defer Option B** (physical reorg) until after an inbound-link audit.
3. **Confirm the no-delete policy** (retain historical drafts/pointers per ADR-002 §6 / QC DOC-11; de-dup = declare authority + cross-link, not remove).
4. **Decide the traceability de-dup** (§4): consolidate `traceability-matrix.md` into `REQUIREMENTS_TRACEABILITY.md` (one becomes a pointer), or keep both.
5. **Authorize S3 entry-doc refresh** (README/HANDOVER/GAS_API_SPEC → V49/0.9.2, 56 ops, B2b done) — recommended immediately after ratification since these mislead the next-AI today.
6. Standing human gates unchanged: PDPA/security/UAT/release sign-offs, ADR ratifications, QR device acceptance, credential rotation. This proposal approves none of them.

## 9. Honest boundaries

- This is a **documentation-organization proposal**, not a policy, schema, security or release approval, and not a runtime change.
- Counts cited (V49/0.9.2, 56 ops, 25 entities, 97/97, main `19f3e54`) are the **current verified** markers from [CURRENT_DELIVERY_STATUS.md](CURRENT_DELIVERY_STATUS.md); dated evidence retains its own recorded counts.
- Classification in §3 is by filename + verified headers + known delivery state; S2/S4 will confirm each file's tier by reading it before banner application (no blind rewrite of 123 files).
- A local `origin/main` tracking-ref staleness was detected and safely fast-forwarded to the authoritative server SHA `19f3e54` during this slice; **no server history was changed and no merged work was lost** (#121–#124 are all present on server main, confirmed via GitHub API compare).