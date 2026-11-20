# P6 Vehicle Contact — Primary Workflow Delivery Plan

**Document ID:** P6VC-PLAN-E2E-001  
**Version:** 1.0.0 | **Baseline date:** 2026-11-20  
**Status:** ACTIVE DEVELOPMENT PLAN / DEVELOPMENT ENVIRONMENT ONLY  
**Scope:** Phase 1 vehicle-contact journey; visitor/pass exchange remains out of scope

## 1. Product delivery rule

The primary business journey is the delivery axis for P6 Vehicle Contact:

```text
Create registration campaign
  -> receive vehicle registration
  -> upload five vehicle photos
  -> submit for review
  -> review and approve or reject
  -> create vehicle, primary contact, photos and QR
  -> scan QR or search plate and province
  -> disclose permitted vehicle/contact/photo/history data
  -> retain lookup/change audit evidence
```

Individual use cases, actors and administration pages are capabilities that enable or govern this journey. They remain independently permissioned and tested, but their existence does not prove the primary journey is complete. A page, API operation or passing unit test alone is not end-to-end acceptance.

Frontend navigation is permission-driven. Cloudflare Worker validates the public browser boundary and exact DTO shapes. GAS remains the authority for authentication, authorization, resource scope, business rules and persistence.

## 2. Current evidence baseline

Observed on 2026-11-20:

- Frontend `0.4.0`; Backend API `0.4.0`, `apiVersion: v1`
- assisted intake and its live deployment are recorded in [FE-REGISTRATION-INTAKE-01](FRONTEND_FE_REGISTRATION_INTAKE_01_EVIDENCE_20261120.md)
- registration review is recorded in [FE-REGISTRATION-ADMIN-01](FRONTEND_FE_REGISTRATION_ADMIN_01_EVIDENCE_20261120.md)
- STAFF plate lookup is recorded in [FE-STAFF-01](FRONTEND_FE_STAFF_01_EVIDENCE_20261119.md)
- the GAS synthetic lifecycle runner covers campaign creation, five photo uploads, submission, approval, lookup, QR rotation/resolve and cancellation
- the deployed intake chain has safe health and invalid-campaign evidence through Frontend gateway -> Worker -> GAS

This baseline does **not** prove a browser-driven write journey, QR camera scanning, realistic mobile-photo latency, physical-device acceptance, recovery after abrupt GAS timeout, production privacy/security approval or use with real personal data.

## 3. Journey capability crosswalk

| Journey stage | Principal actor/capability | API operations | Current UI/evidence | Remaining acceptance |
|---|---|---|---|---|
| Campaign governance | permission `campaigns.manage` | `campaigns.create`, `campaigns.list`, `campaigns.revoke`, public `campaigns.validate` | System administration page; intake validates a token | controlled browser write UAT and token-handling evidence |
| Receive registration | combined administrator session for navigation; campaign token for public API | `photos.upload`, `registrations.submit` | route `registration-intake`; five responsive inputs | synthetic five-photo write through deployed Worker and GAS |
| Review registration | permission `vehicle.registration.approve` | `registrations.listPending`, `registrations.detail`, `registrations.review` | route `registration-review` | authenticated browser decision UAT, stale/double-decision and photo-review evidence |
| Materialize vehicle | GAS business transaction | approval creates vehicle, primary contact, photos and initial QR | Backend source/regression evidence | abrupt-timeout reconciliation and durable partial-write evidence |
| Plate verification | permission `vehicle.lookup`, with separate disclosure permissions | `vehicles.lookup`, `vehicles.detail`, `contacts.read`, `photos.list`, `vehicles.history` | STAFF search route and source evidence | unified live result workspace and operational UAT |
| QR verification | permission `vehicle.lookup` | `qr.resolve` | strict Worker DTO and manual Vue resolver are release candidates; scanner POC exists | merge/deploy evidence, camera integration and physical-device matrix |
| QR governance | permission `qr.manage` | `qr.issue`, `qr.revoke`, `qr.replace` | System administration page | print/deep-link UX and token-safe live evidence |
| Audit/governance | permission `audit.read` and server audit writers | `audit.query`, `audit.export` plus lookup/change audit writes | System administration page | end-to-end correlation without credential, campaign, session or raw QR token disclosure |

The complete operation/use-case inventory remains authoritative in [Use Case and Sequence Diagram SSOT](use-cases/README.md). This plan supplies delivery order; it does not replace operation contracts.

## 4. Ordered vertical slices

| Order | Slice | Deliverable | Exit evidence |
|---:|---|---|---|
| 1 | `E2E-PLAN-01` | Journey-first plan, crosswalk, backlog and gates | SSOT validators and review pass |
| 2 | `E2E-CONTRACT-01` | Strict authenticated Cloudflare DTO contract for `qr.resolve` | positive/negative Worker contract tests; arbitrary operations denied |
| 3 | `E2E-FE-01` | Authenticated Vue QR resolver with manual token fallback and shared permitted result | route/page/composable/port/adapter tests; invalid, revoked/not-found, forbidden, error and success states |
| 4 | `FE-QR-SCAN-01` | Mobile camera decoding connected to the proven resolver contract | camera choice/cleanup, permission denial, decode timeout and manual fallback evidence |
| 5 | `FE-VEH-DETAIL-01` | One permitted result workspace shared by QR resolve and plate lookup | contact/photo/history disclosure tests; mobile/desktop and corporate/dark evidence |
| 6 | `E2E-LIVE-01` | Controlled synthetic campaign -> five photos -> submit -> approve -> lookup -> QR resolve through Worker and GAS | sanitized environment/version/commit evidence; no real data or tokens in artifacts |
| 7 | `E2E-BROWSER-01` | Browser automation through deployed SPA and Worker | refresh persistence, both lookup branches, accessibility and responsive evidence |
| 8 | `E2E-DEVICE-01` | Physical Android/iOS scanner and realistic-photo acceptance | camera choice/cleanup/permission fallback plus measured latency evidence |
| 9 | `E2E-RECOVERY-01` | Timeout, idempotency, conflict and partial-write reconciliation | failure-injection evidence linked to design/performance gates |

Each slice follows `route -> page -> composable/application port -> API adapter -> Worker DTO -> GAS operation` where a UI is involved. Merge contracts before their UI consumer. Do not deploy a write path until proportionate tests and evidence pass.

## 5. Primary journey Definition of Done

The journey is DONE-EVIDENCED only when all applicable statements are true:

1. A controlled synthetic registration traverses deployed Frontend -> Cloudflare Worker -> GAS without bypassing the selected transport.
2. Exactly five valid photo slots are associated with one idempotent registration request.
3. Review approval creates the expected active vehicle, one primary contact, active photos and an active QR; rejection creates none of those records.
4. QR resolve and plate/province lookup identify the same vehicle, while contact/photo/history disclosure follows server-returned permissions.
5. Unauthenticated, forbidden, expired, invalid/revoked token, duplicate, stale, timeout and retry cases fail closed.
6. Refresh preserves only approved session and endpoint preferences; passwords, campaign tokens, raw QR tokens and image payloads are not persisted.
7. Unit, contract, GAS regression, Worker, browser, responsive, corporate/dark, accessibility, dependency and SSOT gates pass for the exact commit.
8. Live evidence records Frontend, Worker and Backend versions plus commit and environment without credentials or personal data.
9. Android/iOS operational evidence and production security, privacy, data-owner and rollback approvals are recorded separately; development success never implies production approval.

## 6. Quality and release gates

| Gate | Development requirement | Current status |
|---|---|---|
| Contract | inventory, DTO, permission and canonical errors agree across three layers | **PASS — DEPLOYED BOUNDARY** — strict authenticated QR/plate DTOs and Vue resolver are deployed; authenticated positive-match UAT remains open |
| Source tests | Frontend, Worker and GAS regression pass | **PASS for delivered slices** — exact future slice must rerun |
| Deployed integration | health plus controlled synthetic business journey through Worker | **PARTIAL PASS** — health/invalid campaign proven; mutating browser journey pending |
| Recovery | idempotency and abrupt partial-write reconciliation | **BLOCKED** — PREPARED journal and multi-write recovery remain open |
| Device/performance | physical QR camera and realistic five-image latency | **NOT RUN** |
| Security/privacy | non-bypassable ingress, media privacy, PDPA and operational approval | **BLOCKED for production** |
| Release | named owner acceptance, rollback and monitoring | **BLOCKED for production** |

## 7. Dependencies and blockers

- [VC-W17](https://github.com/idev006/MT-Agency-Super-App-Framework/issues/17) tracks scanner/search/detail/operator completion.
- [VC-W18](https://github.com/idev006/MT-Agency-Super-App-Framework/issues/18) tracks Vue scanner consolidation and physical-device behavior.
- [VC-W31](https://github.com/idev006/MT-Agency-Super-App-Framework/issues/31) tracks secured staging E2E beyond unit/contract evidence.
- [Design gate #38](https://github.com/idev006/MT-Agency-Super-App-Framework/issues/38) owns sequence/contract, direct-ingress, plate-photo trust and recovery discrepancies.
- [Performance gate #39](https://github.com/idev006/MT-Agency-Super-App-Framework/issues/39) owns real HTTP latency, concurrency and realistic mobile-image profiling.
- Native GitHub Projects v2 synchronization is not verified because the current CLI token lacks `read:project`; issue state plus one `status:*` label remains Kanban authority.

No real personal data is authorized by this plan. GAS source push still requires the exact manual confirmation documented in the deployment workflow, and publishing a Web App deployment remains a separate owner action.
