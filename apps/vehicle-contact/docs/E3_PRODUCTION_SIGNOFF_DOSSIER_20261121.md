# E3 — Production sign-off dossier (prepared for owner review)

**Date:** 2026-11-21 (Asia/Bangkok)
**Slice:** E3 (PM plan lane A-E3). **Prepared by assistant; NOT self-approved.** Every gate below requires an explicit human sign-off (Project Owner / PDPA / security / UAT / release).
**Baseline:** `main` @ `69cf3e3`; GAS live Web App **Version 41** (`backendVersion 0.9.0`); Frontend `0.8.0` on Pages; Worker `p6vc-api-test-console` (commit `b08737d9`).

## 1. Verified engineering evidence (credential-free unless noted)

| Area | Evidence | Result |
|---|---|---|
| GAS source hardening | B1 org-cycle (#93), B4 login constant-work (#94), B2 submit reconciliation + journal recovery (#96), C1 `changePending.proposedDelta` | merged; full GAS suite `npm run check` EXIT 0 |
| GAS live publish | clasp push → version 41 → `update-deployment` live; webapp manifest `ANYONE_ANONYMOUS` fix (#104) | live `@41`; health `0.9.0 ready` via direct `/exec` + Worker |
| Live outage incident | v40 404 (clasp wiped editor-managed access) → fixed permanently via manifest | RESOLVED; [incident SSOT](GAS_CLASP_WEBAPP_MANIFEST_INCIDENT_20261121.md) |
| Cross-role RBAC | `actor-rbac-matrix` 5 roles × 49 ops | **245 checks** (78 allowed / 167 denied; anonymous denied 49, zero writes; client-role rejected) |
| Worker gateway contract | offline suite | **31/31** (incl. 3 scoped reads DTO + negatives) |
| Live edge fail-closed | `verify-live-worker-failclosed.mjs` vs deployed Worker | **14/14 PASS** (origin/allowlist/DTO/session/size/method/version denials pre-GAS; public health ready) |
| Live approval E2E (authenticated, synthetic) | A2 journey | **10/10** + negatives `INVALID_REQUEST_STATE`/`PHOTO_NOT_FOUND`; [evidence](LIVE_DEV_E2E_EVIDENCE_20261121.md) |
| Live full regression (authenticated, synthetic) | A3, 5 roles + 3 scoped ops | **70/70 tests, 55/55 ops**, 0 missing / 0 cleanup failed |
| Reference seed | gated coercion-incident recovery + checksum reapply | **645 rows APPLIED**, mode `ADVISORY`; catalog 77/524/16/17 via Worker |
| Frontend slices | C1 change-review, C2 vehicle-detail, C3 maintenance, C4 my-vehicles | source-complete + test-green (FE 172/172) + build green; **live/browser acceptance pending** |
| Worker deploy | assistant self-deploy via wrangler OAuth | live; `registrations.photo` allowlist; Origin-locked |

## 2. Open human gates (the real critical path) — ALL OPEN

### 2.1 PDPA
- [ ] Lawful basis + consent + rights + retention + ROPA + notices + review checklist sign-off. Pack: [PDPA_GOVERNANCE_PACK](PDPA_GOVERNANCE_PACK.md), [PDPA_LAWFUL_BASIS_DECISION](PDPA_LAWFUL_BASIS_DECISION.md), [PDPA_CONSENT_AND_RIGHTS](PDPA_CONSENT_AND_RIGHTS.md), [PDPA_DATA_RETENTION_AND_RELEASE_GATE](PDPA_DATA_RETENTION_AND_RELEASE_GATE.md), [PDPA_ROPA_REGISTER](PDPA_ROPA_REGISTER.md), [PDPA_PRIVACY_NOTICES](PDPA_PRIVACY_NOTICES.md), [PDPA_REVIEW_CHECKLIST](PDPA_REVIEW_CHECKLIST.md).
- [ ] Destructive-retention enable (D5) + business mapping (B3) before C5 console goes live; synthetic rehearsal only, two-person, legal_hold.

### 2.2 Security
- [ ] Ratify **VC-ADR-014 / VC-ADR-015** ([DECISION_LOG](DECISION_LOG.md)).
- [ ] Secrets handling confirmation: DEV creds only in gitignored `.env`; never committed/logged; clasp/wrangler creds in named profiles / OAuth, not repo.
- [ ] Server-authoritative RBAC + fail-closed edge accepted as the authorization model (evidence §1).
- [ ] Google identity timing (D4): defer to Phase 4 / local JWT verification — owner confirm.

### 2.3 UAT
- [ ] Browser acceptance of gallery/copy UX on synthetic requests (owner sign-in).
- [ ] 5-role × use-case browser walkthrough (C1–C4 screens) on live DEV.
- [ ] Physical Android/iOS QR camera acceptance (resume from stash; direct adapter-cleanup tests first).

### 2.4 Release
- [ ] **D-E1 data-scale decision** ([E1 design](E1_INDEXED_DATASTORE_MIGRATION_DESIGN_20261121.md)): bounded-volume Sheets initial production **vs** Firestore migration.
- [ ] RC build + Pages publish + Worker + GAS publish checklist; rollback plan (GAS version pin + Worker redeploy + Pages revert).
- [ ] Decisions **D3** (sequencing), **D5** (destructive enable), **B3** (retention mapping) ratified.
- [ ] `ENFORCED` catalog mode remains separately gated (currently `ADVISORY`); no real data until approved.

## 3. Residual risks & mitigations

| Risk | Level | Mitigation / gate |
|---|---|---|
| Sheets O(rows) at production volume | high | D-E1 bounded-volume caps + retention/archive; migration design ready (E1) |
| Destructive retention on real data | critical | D5 gate, synthetic rehearsal only, two-person, legal_hold |
| Authenticated hardening probes not yet re-run post-v41 | medium | owner fills `.env` → assistant runs B1/B4/B2 negatives + C1 acceptance |
| Browser/UAT acceptance not run | medium | owner sign-in walkthrough (§2.3) |
| Partial-write journaling for review/assignRoles (B2b) deferred | medium | manual [recovery runbook](OPERATION_JOURNAL_RECOVERY_RUNBOOK_20261121.md); B2b scheduled post-release |

## 4. Sign-off record (to be completed by humans)

| Gate | Reviewer | Decision | Date | Signature/ref |
|---|---|---|---|---|
| PDPA | | ☐ approve ☐ reject | | |
| Security (ADR-014/015) | | ☐ approve ☐ reject | | |
| UAT | | ☐ approve ☐ reject | | |
| Release (incl. D-E1) | | ☐ approve ☐ reject | | |

**Assistant position:** engineering is live + hardened + evidenced; this dossier is complete and ready for review. **No gate is self-approved.** Production release proceeds only after the four human sign-offs above.