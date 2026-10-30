# MT Vehicle Contact v1.0 — Workflow & Photo Pipeline
**Status:** PROPOSED / Implementation-ready design draft | **Date:** 2026-10-30
**Scope:** identify registered responsible person for parked vehicle and enable authorized tap-to-call. Five photo slots per vehicle; no parking-entitlement engine in v1.

## 1. Workflow A — Registration (Operator)
1. Login via platform SSO; backend confirms `vehicle.create` in scope.
2. Enter plate/province, type, make, model, color, primary responsible contact and verified phone.
3. Validate required fields, normalization, conflicts and contact; reserve vehicle ID in DRAFT.
4. Capture or select vehicle photos in five labeled slots: FRONT, REAR, LEFT, RIGHT, THREE_QUARTER. Allow filling incrementally in draft.
5. Frontend previews and optionally compresses before upload; never trust client MIME/size alone.
6. Backend grants short-lived upload authorization to private Supabase Storage paths scoped to vehicle ID and slot; restrict formats JPEG/PNG/WebP, example policy ≤5 MB per source file (configurable), remove disallowed metadata/EXIF location and normalize orientation. **Do not retain original GPS metadata.**
7. Upload image, validate file signature/dimensions, create thumbnail/optimized rendition in controlled processing step, store metadata; mark slot READY only after verified upload. Reject suspicious or unsupported files.
8. Operator verifies required vehicle/contact fields; promote DRAFT → ACTIVE without requiring photos. Up to five photo slots may be filled incrementally. Missing photos must be shown as 'not available', never block urgent QR/contact rollout.
9. Generate opaque QR token (CSPRNG, ≥128 bits), store digest; print sticker with human-readable registration and QR URL. Never embed PII in QR.
10. Audit creation, photo changes, activation and QR issuance; show success and recoverable error on failed upload.

## 2. Workflow B — Scan & Contact (Viewer)
1. Commander scans QR with native phone camera (URL deep link), or in-app scanner with front/rear toggle; if camera unavailable manually search plate + province.
2. If unauthenticated, complete platform login and return safely to intended vehicle detail. Browser vs LINE session may differ.
3. Backend validates token digest, active QR, active vehicle, platform identity, `vehicle.access`, `vehicle.read`, `vehicle.contact.read` and scope.
4. Return minimal authorized fields and short-lived authenticated image URLs or a protected image proxy. No public bucket, no public phone endpoint.
5. Detail page immediately presents plate, make/model/color, responsible person and prominent tap-to-call action; five-photo gallery is secondary, lazy-loaded (first/front thumbnail prioritized).
6. User compares real vehicle with registered photos; mismatched QR suggests human follow-up. QR copy itself is not detectable cryptographically.
7. Phone opens `tel:` upon explicit tap. Do not start call automatically; log authorized lookup with privacy controls.

## 3. Workflow C — Image Update / Deletion
- Operator must pass `vehicle.update` or dedicated `vehicle.photo.manage` authorization.
- Replacement: upload new version → verify READY → atomically switch slot pointer → asynchronously remove orphaned object according to retention policy.
- Old files not reusable via public URL; signed URLs expire quickly. Revocation prevents new accesses, but already downloaded images cannot be recalled.
- Deletion/archival follows approved retention and audit policy, with clear user feedback.

## 4. Technical Photo Pipeline
```text
Mobile capture / file selection
  → browser preview + optional resize/compress
  → authenticated upload request (vehicle_id + slot + metadata)
  → backend validates app permission and object path
  → private Supabase Storage upload (short-lived authorized URL)
  → server-side content verification / metadata stripping / optimize
  → image READY + metadata row committed
  → protected signed access / secured API when vehicle scanned
  → gallery (1 thumbnail eagerly, remaining photos lazy)
```
**Security:** storage policies restrict writes/reads; choose protected server functions for contact-sensitive access; never rely solely on path obscurity. Signed URLs are temporary bearer credentials; do not leak to analytics, caching proxies or logs. Use conservative retention.

### Data-model amendments
- `vc_vehicle_photos`: `id` UUID PK; `vehicle_id` FK; `slot` enum FRONT/REAR/LEFT/RIGHT/THREE_QUARTER; `object_path` (private); `thumb_path`; `mime`; `bytes`; `width`; `height`; `status` (PENDING/READY/FAILED/ARCHIVED); `version`; `uploaded_by`; `created_at`; `updated_at`.
- Unique current/READY photo per (`vehicle_id`, `slot`) via partial uniqueness or explicit current flag and transaction.
- Avoid a comma-delimited `photos` column or 5 hard-coded URL fields. A five-slot UI is compatible with an extensible relational table.
- Private bucket: `vehicle-photos`, object key `vehicles/{vehicle_uuid}/{slot}/{version}/{random_filename}`.
- Backend checks role/scope for signed photo access; unauthorized/expired QR must not reveal image.
- Defined upload byte limit, rate limits, retries, cleanup of abandoned pending uploads and quotas.

## 5. UI screens and validation
**Operator:** register form → five clearly labeled photo slots with thumbnail, camera/gallery, retake/replace, upload progress/errors → confirm primary phone → activate → QR print.

**Viewer:** big plate + full call button above fold; concise car attributes + registered contact + photo cover; expandable 5-image gallery. Vehicle photos must never push the phone button far below fold on ordinary mobile screens.

**Error cases:** offline; partial upload; blurred/wrong side; permission denied; phone unavailable; no photos; rotated QR; data mismatch; upload timeout; duplicate plate/province. Define accessible error messaging and retry.

## 6. Acceptance Tests
- Five specified photo slots supported, correctly ordered and replaceable; sixth photo blocked unless requirement updated.
- New records can activate with 0–5 READY photos; no photograph is required for v1 activation.
- Android/iOS: camera capture, gallery pick, permission denial handling; WebView variations tested.
- Every uploaded file validated by backend and stored in PRIVATE storage; EXIF GPS stripped; thumbnails generated.
- No anonymous or cross-unit photo access; signed image URLs short-lived; direct Storage access denied when policy disallows.
- A valid QR opens vehicle and authorized phone quickly; native scan, in-app scanner, manual lookup all tested.
- Simulate 500+ vehicles × 5 images; test list performance, storage budget, upload retries and page response.
- Front photo and contact render first; others lazy-loaded.
- Verify photo replacement cleanup and audit, staged rollback and backup/restore procedure.

## 7. Pipeline for Implementation (Rapid Delivery)
**P0:** confirm up-to-five optional photo slots, storage limits, privacy and permitted roles.  
**P1:** migration for photos + private bucket policies + staged test data.  
**P2:** operator UI five photos with reliable upload/retake.  
**P3:** thumbnail rendering and secure detail API/gallery.  
**P4:** QR scanner/SSO and tap-to-call end-to-end.  
**P5:** real Android/iOS physical tests, security negatives, pilot 500+ vehicle scale estimate.  
**P6:** policy signoff, guarded production rollout and support documentation.

**Cross-reference:** [PRD](PRODUCT_REQUIREMENTS.md) · [Technical Design](TECHNICAL_DESIGN.md) · [Test & Delivery](TEST_AND_DELIVERY.md).
