# Product Requirements Document — MT Vehicle Contact v1.0

**Status:** PROPOSED | **Owner:** to be appointed | **Date:** 2026-10-30

## 1. Problem and outcome
Commanders/security personnel see unknown parked vehicles and cannot immediately reach the person who can move them. Goal: authenticated mobile search provides vehicle identity and authorized contact in minimal steps.

Success is measured by **time from scanning/opening to seeing a callable responsible contact**, not number of features.

### Measurable target (to validate)
- With a valid session and good connectivity, target ≤2 seconds p95 from QR resolution request to displaying stored vehicle/contact data; benchmark before promising SLA.
- From native phone-camera QR scan: QR → record → call in no more than three user actions when already signed in.
- 100% of sensitive contact responses require server-verified permission; no anonymous record disclosure.
- Usability test with real personnel, Android and iOS, including front/rear camera switching and permission-denied fallback.

## 2. Personas
- **VIEWER:** commander/designated staff: scan/search, read permitted vehicle/primary contact, tap phone.
- **OPERATOR:** manage approved vehicle entries, contact links, QR issuance/revocation; includes viewer powers.
- **APP_ADMIN:** app-specific administration and delegation subject to framework rules; cannot bypass platform approval.

## 3. Use cases and acceptance rules
| ID | Use case | Acceptance |
|---|---|---|
| VC-01 | Register vehicle | Plate/province, type, make, model, color, responsible person, phone; prevent duplicate active registration under agreed key; record editor |
| VC-02 | Issue/print sticker | New high-entropy QR maps to exactly one active vehicle; QR contains no PII; printing has human-readable plate/vehicle reference |
| VC-03 | Native camera QR | HTTPS URL resolves to safe authentication handoff then exact vehicle record (not index/search) |
| VC-04 | In-app scanner | Works on supported Android/iOS; rear/front choice; stops old video tracks on camera switch; camera failure gives fallback |
| VC-05 | View vehicle | Show plate/province, type, make/model/color, registered responsible person/unit; show five labeled vehicle photos (front, rear, left, right, 45-degree) |
| VC-06 | Contact person | Authorized role sees click-to-call phone link (`tel:`), phone formatting/validation; never auto-call |
| VC-07 | Manual plate lookup | Search by normalized Thai plate and province; ambiguous results require explicit selection |
| VC-08 | No match / revoked QR | Safe 'not found / verify with operator' message; do not reveal unapproved personal data |
| VC-09 | Person or phone changes | Update relationship/contact, preserve audit; QR unchanged unless suspected compromise or sticker replacement |
| VC-10 | Suspicious QR copy | Human compares displayed plate, model, color and optional registered photo; may stop without assuming verification succeeded |
| VC-11 | Authorization denied | Logged-in user without app/permission cannot read record by direct URL, API, or guessed token |
| VC-12 | Revoke/replace QR | Only authorized operator; old QR becomes invalid; changes audited |

## 4. UX pages
1. **QR landing/deep link**: redirects to sign-in if required, preserves only validated/short-lived safe navigation state.
2. **Vehicle detail (primary screen)**: large plate, vehicle attributes, primary responsible contact, **large Call button**; status if missing contact.
3. **Scanner**: camera permission request, rear/front toggle, supported device picker (optional), manual search fallback.
4. **Plate search**: plate + province, exact/normalized search, safe ambiguity handling.
5. **Operator list/edit**: controlled add/edit/import, validate required fields, QR print/rotate; not visible to VIEWER.

### Navigation
`/apps/vehicle` → Scan/Search; `/v/<opaque-token>` → secure lookup → Vehicle detail. External phone camera opens same HTTPS URL; only the authenticated view shows contact data.

## 5. Data captured
- Vehicle: plate, province, type, make, model, color, five image slots: front, rear, left, right, three-quarter; zero to five labeled images may be supplied; images are optional for activation to prioritize rapid contact; missing slots are clearly labeled.
- Contact: verified internal profile if available, display name/rank/unit, phone, relationship: responsible user/registered owner claim; optional standby contact deferred unless approved.
- Metadata: status, source, updated time, last verified time, operator/audit fields.
- QR token separate from visible plate and PII.

**Terminology:** say 'ผู้รับผิดชอบรถที่ลงทะเบียน' rather than legally certified owner unless legal ownership was separately verified.

## 6. Rules and edge cases
- Multiple vehicles per person permitted; multiple people per vehicle can be modeled but v1 selects one **primary active responsible contact**.
- Mobile phone calls only after user gesture; if tel handler absent, show telephone number/copy as permitted.
- If no QR, lookup by plate; if no record, present 'ไม่พบข้อมูล — ติดต่อผู้ดูแล'.
- Stale or incorrect contact must be correctable by authorized operator, with historical audit.
- Revoked/discontinued vehicle cannot expose phone through old QR.
- Unauthorized users see no name or phone even if they know an exact QR identifier.
- QR is cloneable; matching visible attributes is a human check, not cryptographic proof.
- Do not show sensitive personal phone numbers to public/anonymous scanners.
- Data source consent/legal basis, notice, and contact update responsibility require agency approval.

## 7. Explicit exclusions for v1
Parking entitlements/zone assignment; permit issuance; automated relocation request workflow; LINE notification; automatic owner lookup from Department of Land Transport; AI OCR; advanced analytics; offline replicated contact directory.

## 8. Questions to sign off
1. Who maintains and confirms phone/contact accuracy?
2. Which internal roles may see full phone numbers? Any need for call relay?
3. Whether personnel directory can safely be linked or initial controlled manual entry is required.
4. Acceptable initial data collection mechanism and information/privacy notice.
5. Confirm image privacy/retention and whether any photo is mandatory later; v1 does not block activation for missing photos.
6. Approved domains and production hosting/security review.
