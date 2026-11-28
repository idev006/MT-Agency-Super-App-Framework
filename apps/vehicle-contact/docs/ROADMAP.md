# P6 Vehicle Contact — roadmap to finish (tracked)

Owner, 2026-11-27: *"จงวางแผน เพื่อดำเนินการให้ครบ และ track ได้"*. One ordered list; every item is a GitHub issue with its done
criteria. Owner 2026-11-28 approved the local-first DEV plan once (VC-ADR-052), including subsequent DEV merges and deploys.
Work goes top to bottom unless the owner reorders. Each item = small PRs → local tests + green CI → DEV deploy → proof (live suite
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
| R03 | Photo rules by the system admin, applied on the device: size, quality, max bytes, min size, orientation (VC-ADR-055); replace compresses; admin fields | [#296](https://github.com/idev006/MT-Agency-Super-App-Framework/issues/296) | — | merged — #334 (BE 0.9.64) + #335 (FE 0.9.24, Pages live on merge); backend deploy + live proof pending |
| R04 | Move existing photos into their vehicle folders (PR C, dry run first) | [#297](https://github.com/idev006/MT-Agency-Super-App-Framework/issues/297) | R01 | todo |
| N1a | Foundation + system / list ops as native async Node (7 ops; system.health stays legacy until N4) — VC-ADR-051 | [#311](https://github.com/idev006/MT-Agency-Super-App-Framework/issues/311) | — | **done — 0.9.60 proven** (PRs 1–3 + fix #323; core 22/64; 126/126 live suite, DATA_PROOF 7/7; system.health deferred to N4) |
| N4a | Browser calls the core directly; no Worker route in the web build (VC-ADR-052) | [#322](https://github.com/idev006/MT-Agency-Super-App-Framework/issues/322) | N1a core front door | **done — FE 0.9.23 live** (PR #324, Pages run 46050309613; public browser and core gateway proof) |
| N1b | Vehicles, QR, change requests, registration review (16 ops) | [#312](https://github.com/idev006/MT-Agency-Super-App-Framework/issues/312) | N1a | in progress — PR 1 `qr.history` proven 0.9.61; PR 2 `vehicles.listMine` proven 0.9.62 (126/126 suite, DATA_PROOF 7/7) |
| N2 | Photos, retention, audit (10 ops) | [#313](https://github.com/idev006/MT-Agency-Super-App-Framework/issues/313) | N1a | todo |
| N3 | Users, organizations, campaigns (15 ops) | [#314](https://github.com/idev006/MT-Agency-Super-App-Framework/issues/314) | N1a | todo |
| T1 | Code map covers the Node core (acorn) + LSP config for core + README current + Kanban board document (VC-ADR-056) | [#336](https://github.com/idev006/MT-Agency-Super-App-Framework/issues/336) | — | in progress |
| L1 | Web app + Node core on localhost with stub adapters — test without deploying (VC-ADR-056) | [#337](https://github.com/idev006/MT-Agency-Super-App-Framework/issues/337) | — | todo |
| W1 | Retire the Cloudflare Worker: out of the live suite / CI / docs, then delete it (owner approved deletion) | [#338](https://github.com/idev006/MT-Agency-Super-App-Framework/issues/338) | — | todo |
| G1 | Reduce GAS clasp project to signed photo bridge only | [#329](https://github.com/idev006/MT-Agency-Super-App-Framework/issues/329) | R10, R11, trigger retirement, separate source-removal confirmation | in progress — 60-file current artifact; one-file local candidate + VM proof; no remote removal |
| R10 | GAS 2c-3b — reference seed as a core job | [#303](https://github.com/idev006/MT-Agency-Super-App-Framework/issues/303) | — | in progress — native async job + manual workflow deployed; DRY_RUN execution succeeded on 0.9.63, independent Firestore COUNT 645; recovery workflow still withheld because it deletes rows |
| R11 | GAS 2c-3c — first admin + admin reset as core jobs (security review) | [#304](https://github.com/idev006/MT-Agency-Super-App-Framework/issues/304) | owner security OK | todo |
| N4 | Retire Worker service; delete legacy API + GAS API code; leave GAS photo bridge only | [#255](https://github.com/idev006/MT-Agency-Super-App-Framework/issues/255) | N1a–N3, N4a, R10, R11 | todo |
| R14 | Capacity for 100 simultaneous logins (sustained test, min-instances decision) | [#306](https://github.com/idev006/MT-Agency-Super-App-Framework/issues/306) | owner cost decision | todo |
| R16 | Production switches + owner actions (reset off, Drive storage, legal, pepper, Google login, GAS trigger) | [#307](https://github.com/idev006/MT-Agency-Super-App-Framework/issues/307) | before real data | todo |
| R17 | Apply the new log retention to old rows (preview + confirm) | [#308](https://github.com/idev006/MT-Agency-Super-App-Framework/issues/308) | owner confirmation | todo |

Progress of the engine move: **24 of 64 operations live** on the core (officer path 6, auth 6, public registration 4,
N1a 6: vehicles.list, qr.markPrinted, system.config.get/update, system.reset.preview/execute; N1b 2: qr.history,
vehicles.listMine). N1b–N3 move the next groups as native async Node ([NODE_CORE_FINISH_PLAN.md](NODE_CORE_FINISH_PLAN.md), VC-ADR-051); N4 cuts over, including system.health.

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

## Agile Kanban execution (VC-ADR-052)

GitHub Issues and their existing `status:*` labels are the live board: `status:todo` → `status:in-progress` → `status:review`
→ closed with `status:done-evidenced`; use `status:blocked` or `status:on-hold` only when their condition applies. Keep one
primary implementation slice in progress at a time; local unit, generated acceptance and mocked browser E2E run before a
PR. CI, deploy, independent live proof and Firestore read-back are separate gates. Record the SHA and evidence in the issue
and DECISION_LOG; a green local or CI result alone does not mark a runtime change done. The older AGILE_KANBAN.md is a
dated historical board, not a second status source.
