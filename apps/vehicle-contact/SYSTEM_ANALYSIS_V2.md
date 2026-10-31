# MT Vehicle Contact — System Analysis & Design v2.0
**Date: 2026-10-31 | Status: PROPOSED / awaiting policy, architecture and PDPA decisions**
## 1. Requirements baseline
North Star: ทุกคันระบุผู้ประสานงานและติดต่อได้. Policy is authoritative; software assists. QR is a reference, not access entitlement. Two operational paths: QR and no QR. Without QR, lookup works **only if plate/contact were recorded or already exist**.

## 2. Actors (human and system)
| Actor | Responsibilities |
|---|---|
| Policy sponsor / premises authority | approve rules, scope, exceptions, pilot |
| Project owner / vehicle registry operator | data governance, scope and registration |
| Unit coordinator / commanding officer | validate regular vehicles, correct records, follow up compliance |
| QR issuer | print, issue, reissue/revoke |
| Gate guard | temporary vehicle intake, pass number, exit closure; verify exceptions |
| Roaming guard | scan/search, verify vehicle, tap-to-call, escalation |
| Regular driver / resident family | submit accurate registration and update contact |
| Visitor / outside police / contractor | register temporary vehicle and reachable coordinator |
| App administrator / privacy owner / DPO | authorization, audits, privacy compliance and review |

## 3. Main use cases with acceptance
| ID | Actor | Use case | Acceptance criteria |
|---|---|---|---|
| UC01 | Regular user + unit coordinator | register regular vehicle | plate/province and one primary contact; checked status before QR |
| UC02 | QR issuer | create/issue/revoke QR | random opaque token; no PII embedded; tested print and issuance recorded |
| UC03 | Gate guard | record temporary vehicle/pass | plate/province/contact/pass ID recorded before normal entry |
| UC04 | Gate guard | close temporary pass on exit | active visit closed, badge returned/exception recorded |
| UC05 | Roaming guard | scan QR | authorized vehicle/contact view; safe invalid/revoked result |
| UC06 | Roaming guard | search plate | normalized plate+province; both regular/active temporary; ambiguous case resolved |
| UC07 | Roaming guard | contact coordinator | phone link shown only to authorized roles; no automatic call |
| UC08 | Unit coordinator | update stale contact | who/when updated; changes reflected in results |
| UC09 | Gate guard + unit coordinator | handle mandatory QR missing | reason, time-limited exception and escalation without automated sanction |
| UC10 | App admin | manage rights | backend rejects anonymous/unauthorized record and direct API |
| UC11 | Admin/privacy owner | retention and delete | expiring visitor records removed on authorized policy schedule |
| UC12 | Guards | offline/outage fallback | manual coordinated SOP and record reconciliation |

## 4. Flow and sequence
- **Regular:** application → unit verify → QR print/issue → sticker installed → guard scan/search when needed → contact.
- **Visitor:** gate check → identify contact and register plate/province → numbered temporary pass → if obstruction plate lookup → contact → exit pass return → close visit → retention policy.
- **Mandatory QR absent:** check existing registry; if awaiting issue/vehicle change/damage assign temporary exception with deadline; if repeated unresolved alert unit; no guard imposed sanction.
- **Emergencies:** safely prioritize access then record/coordinate per approved exception.

## 5. Data conceptual model
- Vehicle(vehicle_id, normalized_plate, province, type, make?, color?, status)
- Contact(contact_id, contact_name_or_role, phone, unit?, last_verified_at)
- VehicleContact(vehicle_id, contact_id, primary, valid_from, valid_to)
- QrCredential(qr_id, vehicle_id, token_hash, status, issued_at, revoked_at)
- Visit(visit_id, vehicle_id_or_snapshot, pass_number, contact_id_or_snapshot, entry_at, exit_at, visit_status)
- QrException(exception_id, vehicle_id, reason, due_date, unit_contact, status)
- AppAccount(account_id, role, unit?, active)
- AuditEvent(actor, action, resource, occurred_at, minimal_metadata)
Storage constraints: plate alone not a unique key; use province + active status; temporary visits can overlap policy-dependent; no public downloadable directory. Contact may be office duty phone rather than personal mobile.

## 6. Functional specification / policy traceability
| Policy | Use cases | Requirement |
|---|---|---|
| POL01 all contactable | UC05–07,UC12 | FR01 unified lookup and callable contact |
| POL02 regular QR | UC01–02,UC08 | FR02 approved registration and QR lifecycle |
| POL03 visitor no QR | UC03–04,UC06 | FR03 temporary visit/pass registry |
| POL04 enforce regular compliance | UC09 | FR04 exception and follow-up |
| POL05 protect personal data | UC10–11 | FR05 authenticated authorization/retention |
FR06: one combined scan/plate search screen; FR07: error/duplicate plate selection; FR08: input normalization and audit; FR09: simple manual outage fallback.

## 7. Nonfunctional + privacy/security requirements
NFR01 enforce authorization at the API/backend, not merely hidden UI. NFR02 QR token unpredictable, no name/phone encoded, revoke. NFR03 least privilege roles, session expiry and lost-device revocation. NFR04 transport encryption, secured data store, backup and recovery. NFR05 access logs and rate limits to prevent mass plate enumeration. NFR06 measure p95 scan/search-to-display from actual field pilot; do not promise unsupported numbers. NFR07 retention and erasure schedule verified against ROPA. NFR08 operational accessibility: mobile-first, minimal input, offline SOP. NFR09 perform ASVS-aligned tests before pilot.

## 8. Architecture Decision Record (open)
Existing [TECHNICAL_DESIGN.md](TECHNICAL_DESIGN.md) proposes React + Supabase Auth/PostgreSQL/RLS and optional GAS/Sheets. Other concept discussions mentioned Vue + GAS/Sheets. **These are unresolved competing proposals.** No claim is made that either backend is production-ready; choose only after privacy/security review, cost, licensing, administrator capabilities and authentication PoC. Do not store contact dataset in a public Sheet. Barcode scanning HTTPS PoC exists, camera access reportedly confirmed on Android and iOS, while end-to-end decode and backend still need test.

## 9. Pilot scenario test set
T01 regular QR works; T02 visitor no QR searches via pass record; T03 visitor not registered -> fail safely; T04 duplicated plate/province ambiguity; T05 invalid/revoked/copied QR; T06 mandatory QR missing due to unissued sticker; T07 repeated noncompliance routed to unit; T08 emergency priority; T09 wrong/disconnected phone; T10 return pass and close; T11 offline; T12 unauthenticated/private URL access denied; T13 stolen officer device; T14 retention deletion; T15 load at busy entrance. Record actual results and evidence for every test.

## 10. QC and implementation gates
G0 command policy approval and named owner. G1 guard/site survey. G2 verified PDPA lawful basis, ROPA notices, consent decision and data controller/DPO review. G3 architecture selection and secure implementation. G4 tests/pilot with data authorization. G5 evidence-based rollout approval. AI review is not legal approval or human field acceptance.

## Source references
NESDC project-manual: https://www.nesdc.go.th/wordpress/wp-content/uploads/2025/08/project-manual.pdf
OWASP ASVS 5.0: https://asvs.owasp.org/
