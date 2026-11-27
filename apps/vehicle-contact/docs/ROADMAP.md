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
| R01 | Prove the per-vehicle photo folders live (0.9.55) | [#294](https://github.com/idev006/MT-Agency-Super-App-Framework/issues/294) | — | in progress |
| R02 | Photos by Drive link instead of base64 (PR B) | [#295](https://github.com/idev006/MT-Agency-Super-App-Framework/issues/295) | R01 | todo |
| R03 | Web app resizes by the admin policy; replace resizes; admin fields (PR 2) | [#296](https://github.com/idev006/MT-Agency-Super-App-Framework/issues/296) | — | todo |
| R04 | Move existing photos into their vehicle folders (PR C, dry run first) | [#297](https://github.com/idev006/MT-Agency-Super-App-Framework/issues/297) | R01 | todo |
| R05 | Wave 3 — registration review on the core (+ duplicate check by plate) | [#298](https://github.com/idev006/MT-Agency-Super-App-Framework/issues/298) | — | todo |
| R06 | Wave 4 — vehicle admin + QR on the core (10 ops) | [#299](https://github.com/idev006/MT-Agency-Super-App-Framework/issues/299) | R05 | todo |
| R07 | Wave 5 — owner changes + photos on the core (7 ops) | [#300](https://github.com/idev006/MT-Agency-Super-App-Framework/issues/300) | R06 | todo |
| R08 | Wave 6 — administration on the core (18 ops) | [#301](https://github.com/idev006/MT-Agency-Super-App-Framework/issues/301) | — | todo |
| R09 | Wave 7 — retention, audit, system reset on the core (9 ops) | [#302](https://github.com/idev006/MT-Agency-Super-App-Framework/issues/302) | R08 | todo |
| R10 | GAS 2c-3b — reference seed as a core job | [#303](https://github.com/idev006/MT-Agency-Super-App-Framework/issues/303) | — | todo |
| R11 | GAS 2c-3c — first admin + admin reset as core jobs (security review) | [#304](https://github.com/idev006/MT-Agency-Super-App-Framework/issues/304) | owner security OK | todo |
| R12 | GAS 2c-4 — GAS = photo bridge only | [#305](https://github.com/idev006/MT-Agency-Super-App-Framework/issues/305) | R10, R11, owner removes the GAS trigger | todo |
| R13 | Shared code out of backend/gas into backend/shared (2d, as waves land) | [#270](https://github.com/idev006/MT-Agency-Super-App-Framework/issues/270) | R05–R09 | todo |
| R14 | Capacity for 100 simultaneous logins (sustained test, min-instances decision) | [#306](https://github.com/idev006/MT-Agency-Super-App-Framework/issues/306) | owner cost decision | todo |
| R15 | Cut over: web app → core, Worker retired, legacy deleted (phase 9) | [#255](https://github.com/idev006/MT-Agency-Super-App-Framework/issues/255) | R05–R13 | todo |
| R16 | Production switches + owner actions (reset off, Drive storage, legal, pepper, Google login, GAS trigger) | [#307](https://github.com/idev006/MT-Agency-Super-App-Framework/issues/307) | before real data | todo |
| R17 | Apply the new log retention to old rows (preview + confirm) | [#308](https://github.com/idev006/MT-Agency-Super-App-Framework/issues/308) | owner confirmation | todo |

Progress of the engine move: **16 of 64 operations** answered by the core (officer path 6, auth 6, public registration 4);
R05–R09 move the other 48.

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
