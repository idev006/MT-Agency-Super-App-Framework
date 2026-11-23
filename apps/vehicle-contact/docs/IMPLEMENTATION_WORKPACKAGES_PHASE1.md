# P6 Vehicle Contact — Engineering Work Packages

**Last updated (git):** 2026-11-17 · **Current state:** [CURRENT_DELIVERY_STATUS.md](CURRENT_DELIVERY_STATUS.md)

**Document ID:** P6VC-WP-001 | **Status:** IMPLEMENTATION BACKLOG / NO RELEASE APPROVAL
**References:** [Implementation Spec](IMPLEMENTATION_READY_SPEC_PHASE1.md), [Test Matrix](IMPLEMENTATION_TEST_MATRIX_PHASE1.md), [Roadmap](DEVELOPMENT_ROADMAP_PHASE1.md), [Issue Kanban](AGILE_KANBAN.md).

## Dependency order (build once per reviewed integration candidate, not per tiny module)
1. **WP-00 Requirements reconciliation:** compare historic UML/PRD/SA/decision log to UC01–UC12; produce traceability and record contradictions. Do not invent approval of historic UML diagrams.
2. **WP-01 Security boundary (D-01/D-02):** choose approved username/password provider, session store and non-bypassable GAS ingress; demonstrate direct URL bypass denied. No protected route enabled without proof.
3. **WP-02 Persistence:** confirm canonical schema D-03, row IDs, uniqueness, concurrency, audit, fake-Sheets repository and recovery. Use synthetic data.
4. **WP-03 Registration/maintenance:** UC01, UC02, UC10 with DTO/port/domain/application/repository tests.
5. **WP-04 QR lifecycle:** UC03, UC04, UC05 with digest, revocation, printing and scanning tests.
6. **WP-05 Search/contact:** UC06, UC07, UC08, UC11; resource-scoped reads, phone disclosure audit, fallback.
7. **WP-06 Frontend:** Vue mobile-first UC09 + scan/search/detail/register/QR/admin, offline-safe fallback, Android/iOS acceptance.
8. **WP-07 Media:** D-04 approval, private Drive adapter and 5-slot policy; no PII until access review.
9. **WP-08 Migration:** immutable registry/checksum, staging backup, LockService, durable journal, guarded executor, verification, recovery drill; no public API.
10. **WP-09 Integration/release:** one candidate build, Node tests, GAS bundle contract, staging deploy, actual API smoke, auth bypass tests, E2E/UAT and security/privacy go/no-go.

## Definition of Ready for each work package
Named source authority and acceptance; no unresolved blocking decision for real-data path; explicit DTO and permissions; test fixtures and rollback; owner/reviewer; issue/PR link. Synthetic implementation may proceed behind a disabled feature flag if decisions are open.

## Blocking decisions that cannot be solved by writing code
- D-01: verified non-bypassable GAS trust boundary and identity/session provider.
- D-02: approved permission matrix and contact disclosure policy.
- D-03: data steward schema and vehicle lifecycle approval.
- D-04: media requirements and access rights.
- D-05: privacy/legal applicability and retention decisions.
- D-06: staging/pilot authority and deployment ownership.

## Acceptance handoff
A WP is `CODE COMPLETE` only after code review + test fixtures + local/CI pass; `INTEGRATION VERIFIED` only with actual staging evidence; `PILOT READY` only after field/UAT and required approvals. Keep these statuses separate in issue comments and reports.
