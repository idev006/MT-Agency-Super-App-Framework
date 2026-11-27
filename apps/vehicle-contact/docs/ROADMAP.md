# P6 Vehicle Contact — roadmap to finish (tracked)

Owner, 2026-11-27: *"จงวางแผน เพื่อดำเนินการให้ครบ และ track ได้"*. One ordered list; every item is a GitHub issue with its done
criteria. Work goes top to bottom unless the owner reorders. Each item = small PRs → owner OK → deploy → proof (live suite
through the core + DATA_PROOF fresher than the suite, dual call, Firestore read-back, load test on hot paths).

**Where to look:** milestones [Node core](https://github.com/idev006/MT-Agency-Super-App-Framework/milestone/1) ·
[Photos](https://github.com/idev006/MT-Agency-Super-App-Framework/milestone/2) ·
[Go-live readiness](https://github.com/idev006/MT-Agency-Super-App-Framework/milestone/3) — each shows % done.
From a terminal: `gh issue list --label status:in-progress` · `gh issue list --milestone "Photos (VC-ADR-049/050)"`.
Status labels: `status:todo` → `status:in-progress` → closed (with the evidence in the decision log).

## The list

| # | Item | Issue | Depends on | Status |
|---|---|---|---|---|
| R01 | Prove the per-vehicle photo folders live (0.9.55) | [#294](https://github.com/idev006/MT-Agency-Super-App-Framework/issues/294) | — | **done** (evidence VC-ADR-046 0.9.53–0.9.55) |
| R02 | Photos by Drive link instead of base64 (PR B) | [#295](https://github.com/idev006/MT-Agency-Super-App-Framework/issues/295) | R01 | **done** (0.9.56: 5 photos 3.5–5.6 s → 0.7–1.5 s) |
| R03 | Web app resizes by the admin policy; replace resizes; admin fields (PR 2) | [#296](https://github.com/idev006/MT-Agency-Super-App-Framework/issues/296) | — | todo |
| R04 | Move existing photos into their vehicle folders (PR C, dry run first) | [#297](https://github.com/idev006/MT-Agency-Super-App-Framework/issues/297) | R01 | todo |
| N1a | Foundation + system / list ops as native async Node (7 ops) — VC-ADR-051 | [#311](https://github.com/idev006/MT-Agency-Super-App-Framework/issues/311) | — | in progress — PR 1 deployed 0.9.57 (vehicles.list, qr.markPrinted on the core); PR 2 deployed 0.9.58 (system.config.*); next PR 3: system.reset.* |
| N1b | Vehicles, QR, change requests, registration review (16 ops) | [#312](https://github.com/idev006/MT-Agency-Super-App-Framework/issues/312) | N1a | todo |
| N2 | Photos, retention, audit (10 ops) | [#313](https://github.com/idev006/MT-Agency-Super-App-Framework/issues/313) | N1a | todo |
| N3 | Users, organizations, campaigns (15 ops) | [#314](https://github.com/idev006/MT-Agency-Super-App-Framework/issues/314) | N1a | todo |
| R10 | GAS 2c-3b — reference seed as a core job | [#303](https://github.com/idev006/MT-Agency-Super-App-Framework/issues/303) | — | todo |
| R11 | GAS 2c-3c — first admin + admin reset as core jobs (security review) | [#304](https://github.com/idev006/MT-Agency-Super-App-Framework/issues/304) | owner security OK | todo |
| N4 | Cut over: web app → core directly, Worker retired, legacy + GAS API deleted | [#255](https://github.com/idev006/MT-Agency-Super-App-Framework/issues/255) | N1a–N3, R10, R11 | todo |
| R14 | Capacity for 100 simultaneous logins (sustained test, min-instances decision) | [#306](https://github.com/idev006/MT-Agency-Super-App-Framework/issues/306) | owner cost decision | todo |
| R16 | Production switches + owner actions (reset off, Drive storage, legal, pepper, Google login, GAS trigger) | [#307](https://github.com/idev006/MT-Agency-Super-App-Framework/issues/307) | before real data | todo |
| R17 | Apply the new log retention to old rows (preview + confirm) | [#308](https://github.com/idev006/MT-Agency-Super-App-Framework/issues/308) | owner confirmation | todo |

Progress of the engine move: **20 of 64 operations** answered by the core (officer path 6, auth 6, public registration 4,
N1a 4: vehicles.list, qr.markPrinted, system.config.get/update); N1a PR 3 + N1b–N3 move the other 44 as native async Node ([NODE_CORE_FINISH_PLAN.md](NODE_CORE_FINISH_PLAN.md), VC-ADR-051), N4 cuts over.

## Done (evidence in DECISION_LOG.md)
- Node core phases 0–2: front door, Integration Manager, shared flows, store rules, async Firestore (gRPC), officer path.
- Wave 0–2: transactions, one password hash rule; auth; public registration (validate, references, upload, submit).
- Performance: login 2,970 → 271 ms at 1 in flight, 0/300 errors at 100 (2 vCPU + thread pool, peppered 60k hashes
  VC-ADR-048, rate-limit 6 rows); submit duplicate check by plate.
- GAS clean-up 2c-1 / 2c-2 / 2c-3a: housekeeping + photo audit as core jobs, daily start from GitHub.
- Photos: size policy set by the admin (VC-ADR-049 PR 1); folder per vehicle shared by link (VC-ADR-050 PR A).

## How the list is kept current
When an item starts: its issue gets `status:in-progress`. When its proof passes: the evidence goes into DECISION_LOG.md, the
issue is closed with a link, and this table's status column is updated in the same docs PR.
