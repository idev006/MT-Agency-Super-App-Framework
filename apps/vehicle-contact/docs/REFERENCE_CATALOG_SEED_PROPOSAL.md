# P6 Vehicle Contact — Reference Catalog Seed Proposal

**Status:** APPROVED FOR IMPLEMENTATION — NOT APPROVED FOR GAS PUSH OR SEED APPLY
**Prepared:** 2026-11-20 (Asia/Bangkok)  
**Target schema:** `p6-vehicle-contact/phase1` version `0.3.0-draft`  
**Target table:** `vc_reference_values`

This document proposes the first bounded catalog. It is not approval to create rows, deploy GAS or enable `ENFORCED`. The successful additive schema migration created an empty table; empty or incomplete content intentionally remains `LEGACY`.

**Approval record:** Project Owner supplied the exact phrase `APPROVE_REFERENCE_SEED_V1` on 2026-11-20. This authorizes the manifest, preview/apply source and tests only.

## 1. Catalog boundaries

| Catalog | Proposed source / owner | Proposed first version | Decision state |
|---|---|---:|---|
| `PROVINCE` | Government two-digit province codes; Thai names checked against the Royal Society public dataset | 77 active rows | READY FOR DATA OWNER REVIEW |
| `VEHICLE_TYPE` | Department of Land Transport registration categories `รย.1`–`รย.17` | 17 active rows, codes `RY01`–`RY17` | READY FOR DATA OWNER REVIEW |
| `PLATE_TYPE` | P6 product taxonomy; must not duplicate vehicle-registration type | 5 candidate rows | BUSINESS DECISION REQUIRED |
| `RELATIONSHIP` | P6 contact/responsibility policy | 6 candidate rows | BUSINESS DECISION REQUIRED |
| `BRAND` / `MODEL` | No complete authoritative bounded source selected | 0 rows | DEFER; frontend keeps text input |
| `COLOR` | Registration-book color vocabulary requires DLT/Data Owner confirmation | 0 rows | DEFER; frontend keeps text input |
| Organizations | Existing active `vc_organizations` records | no duplicated rows | EXISTING AUTHORITY |

Official references:

- [Royal Society province-name dataset on Thailand Government Data Catalog](https://data.go.th/en/dataset/orst_0101) — public Thai/Romanized names; annual metadata; maintained by the Royal Society.
- [Department of Provincial Administration population statistics](https://stat.bora.dopa.go.th/new_stat/webPage/statByYear.php) — government province-code field (`CC-CODE`).
- [Department of Land Transport summary of the Motor Vehicle Act](https://legal.dlt.go.th/gen2/app/api/legal-download.php?download=1&file=article_20231030_164150_fd79887c.pdf) — six broad vehicle classes, 17 registration categories and the separate special red-plate concept.

These sources establish candidate vocabulary. The Data Owner still approves the exact application codes, labels and scope.

## 2. Candidate business taxonomy

### Plate type — five proposed rows

| Code | Thai label | Meaning / constraint |
|---|---|---|
| `STANDARD` | ป้ายทะเบียนปกติ | Permanent registration plate; vehicle usage remains in `VEHICLE_TYPE` |
| `TEMPORARY_RED` | ป้ายแดงชั่วคราว | Special mark for a vehicle held for sale or repair; not a permanent registration category |
| `DIPLOMATIC` | ป้ายคณะผู้แทนทางการทูต | Use only when the registration document supports it |
| `INTERNATIONAL` | ป้ายตามความตกลงระหว่างประเทศ | Cross-border/international-agreement plate |
| `OTHER_REVIEW` | อื่น ๆ — ต้องตรวจสอบ | Advisory intake only; must be reviewed before approval |

### Relationship — six proposed rows

| Code | Thai label | Meaning / constraint |
|---|---|---|
| `OWNER` | เจ้าของรถ | Named registered owner |
| `LESSEE` | ผู้เช่าซื้อหรือผู้เช่า | Lawful possessor under lease/hire-purchase |
| `AUTHORIZED_USER` | ผู้ได้รับอนุญาตให้ใช้รถ | Owner-authorized responsible user |
| `DRIVER` | ผู้ขับขี่ | Current/regular driver who is not covered above |
| `ORGANIZATION_REP` | ผู้แทนหน่วยงาน | Responsible representative for an organization vehicle |
| `OTHER_REVIEW` | อื่น ๆ — ต้องตรวจสอบ | Requires reviewer clarification before approval |

`OTHER_REVIEW` is deliberately visible and reviewable; it is not a silent free-form bypass.

## 3. Proposed seed v1 size

| Catalog | Rows |
|---|---:|
| Province | 77 |
| Vehicle registration type | 17 |
| Plate type | 5 |
| Relationship | 6 |
| **Total proposed initial rows** | **105** |

Brand, model and color remain empty and advisory. The current frontend already falls back to bounded text fields when those lists are empty.

## 4. Automation contract after approval

Initial seed automation should be GAS Editor-only, not a public HTTP write:

1. `previewVehicleReferenceSeedFromEditor()` validates all 105 rows, stable IDs/codes, duplicate constraints, formula safety, parents, current Sheet differences and a deterministic SHA-256 checksum. It performs no writes.
2. The Project Owner reviews the sanitized counts/diff/checksum and sets a one-time Script Property equal to that exact checksum.
3. `applyVehicleReferenceSeedFromEditor()` acquires a lock, creates a Drive backup, journals PREPARED/APPLYING/APPLIED, inserts only the approved manifest and verifies the resulting catalog/version.
4. The approval property is immediately removed. Failure enters `RECOVERY_REQUIRED`; never rerun blindly.
5. The catalog starts in `ADVISORY`. `ENFORCED` requires separate live Frontend -> Worker -> GAS acceptance and explicit approval.

Later SYSTEM_ADMIN CRUD, if required, must be a separate permission-protected API with optimistic concurrency, audit and no role-name inference. It must not weaken the initial seed controls.

## 5. Approval checklist

The Data Owner / Project Owner must explicitly decide:

- [x] Use government two-digit province codes and the 77 Thai province names.
- [x] Use all 17 DLT vehicle-registration categories (`RY01`–`RY17`) rather than a simplified car/motorcycle taxonomy.
- [x] Approve the five proposed plate types.
- [x] Approve the six proposed relationships.
- [x] Defer brand/model/color to advisory text inputs for seed v1.
- [x] Keep seed v1 in `ADVISORY`; do not enable `ENFORCED` yet.
- [x] Authorize implementation of checksum-bound editor-only preview/apply automation. This does not authorize GAS push or seed apply.

After these decisions, implementation may add a machine-readable manifest, unit/contract tests and the two editor entrypoints. Any GAS source push still requires the exact confirmation `PUSH_VEHICLE_GAS`; seed apply requires its own checksum-bound approval after preview.

