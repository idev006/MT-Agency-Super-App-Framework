# Test, Acceptance & Rapid Delivery — MT Vehicle Contact v1.0

**Status:** PROPOSED | **Priority:** deliver the narrow policy outcome rapidly without bypassing security

## 1. Development slices and gates
| Slice | Deliverable | Gate |
|---|---|---|
| S0 | Confirm app owner, contact data source and who may view phone | Policy/privacy signoff on minimum PII |
| S1 | App registration, platform login, roles and mock vehicle detail | Viewer allowed, outsider denied, app access isolated |
| S2 | Vehicle/contact CRUD, typed search and audit | Correct records and validated phone, no unauthorized PII |
| S3 | QR generation, revocation and native QR deep-link | Copy QR resolves to original; revoked QR fails closed |
| S4 | In-app scanner, front/rear selection, mobile UX | Android/iOS physical device tests and fallback |
| S5 | Controlled import, print test, deployment/runbook | Site acceptance with representative vehicles and staff |

**Parallel work:** register/import sanitized vehicle data and build UI with synthetic data while platform foundation is being validated. Do not publish full phone directory in public builds.

## 2. Definition of Done
- All 5 core capabilities: register, QR, scan/search, vehicle details, tap-call.
- 401 for unauthenticated calls and 403 for unauthorized calls; absence of role never grants access.
- Can use ordinary camera app to open QR deep link and recover after authentication.
- In-app scanner offers front/rear selection and can scan on real Android and iOS where supported.
- Vehicle detail clearly labels registered responsible person; call requires deliberate user tap.
- All mutations, QR events and contact reads captured as appropriate in secure audit.
- Replace/revoke QR safely; manual plate fallback and ambiguous plate handling.
- Negative security tests completed; privacy/legal review of PII collection.
- Runbook for staff entry, correction, support, lost QR and access removal.
- No production data/credentials in GitHub repository; staging uses synthetic records.

## 3. Test scenarios
| Test ID | Scenario | Expected |
|---|---|---|
| T01 | Viewer scans authorized QR | Correct car/contact and call control |
| T02 | Anonymous scans QR | Sign-in, no exposed vehicle owner/phone |
| T03 | Account logged in but no app grant | Denied, no PII |
| T04 | Role only for Meeting Room | Denied Vehicle data |
| T05 | Vehicle read but no contact.read | No phone/contact disclosure |
| T06 | Operator creates vehicle and QR | Valid QR printed, resolves exact vehicle |
| T07 | Duplicate/ambiguous plate/province | Deduplicated or explicit disambiguation |
| T08 | Invalid, revoked, rotated QR | Safe error, never stale owner data |
| T09 | QR copied to different car | Shows original data, human notices mismatch |
| T10 | iOS Safari front/rear | Tested camera switching, stream cleaned up |
| T11 | Android Chrome front/rear | Tested camera switching, stream cleaned up |
| T12 | LINE in-app browser | Supported functionality or documented fallback |
| T13 | Camera permission denied | Manual plate search available |
| T14 | Unauthorized direct SQL/API query | Denied by RLS/backend |
| T15 | User contact updated | New phone used; previous phone not exposed |
| T16 | App Admin tries cross-app/self-grant | Denied and logged |
| T17 | Slow/unavailable internet | Clear retry/no-data message, never unsafe public fallback |

## 4. Suggested pilot metrics (targets, not claims)
- Scan→detail response: p95 ≤ 2 seconds on a specified test network after already authenticated (rebaseline after pilot).
- Correct person/phone retrieval in representative pilot: target ≥99% **relative to verified registration records**, not independently verified legal ownership.
- 0 authorized bypasses in defined security tests.
- ≥95% successful QR scans under agreed light/device conditions during pilot, with manual fallback.
- Track registration coverage and time to contact separately.

## 5. Risk register
| Risk | Mitigation |
|---|---|
| Wrong/obsolete responsible person | Require periodic contact verification and easy operator correction |
| QR sticker copied | Show plate/car details, human match, rotate on compromise |
| LINE and browser sessions not shared | Shell-first SSO, separate LINE linking PoC |
| Mobile camera unsupported | Test physical devices, native camera deep-link, manual search |
| Phone exposure | Central entitlement + contact.read + secure API + audit |
| Import errors/duplicate vehicle | Normalization, validation, reversible staging import |
| GAS CORS/security limitations | Use Supabase secured API as primary; GAS adapter only |

## 6. Open approvals / start conditions
- Named business owner and contact-data steward.
- Policy for phone visibility and minimum security group.
- Confirmed preferred production host/domain and entitlement management.
- Retention of contact, lookup audit and revoked QR data.
- Account enrollment method; LINE integration readiness.
- Permission for trial with real data and actual users.

**Release strategy:** feature-flag access by approved pilot group; deploy only after acceptance evidence and owner sign-off.
