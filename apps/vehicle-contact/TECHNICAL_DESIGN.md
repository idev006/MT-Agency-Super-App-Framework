# Technical Design — MT Vehicle Contact v1.0

**Status:** PROPOSED. Technical decisions are candidates until PoC/security review.  
**Parent:** [Master Blueprint](../../docs/MASTER_BLUEPRINT.md)

## 1. System design
**Client:** React + TypeScript mobile-first Shell; HTTPS host, candidate GitHub Pages. Native camera QR works by web URL, in-app scanner uses browser camera APIs.

**Core:** platform Supabase Auth + PostgreSQL/RLS + Edge Functions (candidate). Domain module uses central access control `vehicle.access` and granular permissions. Internal app uses shared session; LINE LIFF identity linkage is an independent PoC.

**Optional:** GAS + Google Sheets for controlled imports/reports, via server-side adapter. Google Sheet is **not** primary datastore and contains no master role grants.

## 2. Domain table plan (logical, not final SQL)
| Table | Core fields | Rules |
|---|---|---|
| `vc_vehicles` | id UUID, plate_normalized, province_code, type, make, model, color, status, created_at, updated_at | unique active plate/province as policy permits; no forced global uniqueness on raw plate |
| `vc_vehicle_photos` | id, vehicle_id, slot, private object_path, thumbnail_path, MIME, size, dimensions, status, version, uploaded_by | exactly five named active slots; authenticated signed access; server-side content checks; see [media pipeline](WORKFLOW_AND_MEDIA_PIPELINE.md) |
| `vc_vehicle_contacts` | id, vehicle_id, person_profile_id?, display_name, org_id?, phone_e164, relationship, is_primary, status, verified_at, created_at | one active primary contact per vehicle; avoid unnecessary duplication of personnel details |
| `vc_qr_tokens` | id, vehicle_id, token_digest, issued_at, revoked_at?, issued_by, reason | token digest indexed unique; raw token only displayed/printed at issue, not logged |
| `vc_lookup_audit` | id, actor_user_id, vehicle_id?, result, source(scan/search), timestamp, correlation_id | protected audit retention and access policy |
| `vc_change_audit` | id, actor_user_id, entity, entity_id, action, before_after_redacted, timestamp | immutable logical history; protect contact changes |

**Important:** If multiple responsible contacts are later needed, enforce one primary active and add ordered alternatives. Keep all production personnel attributes behind authorization.

Image handling uses a private Supabase Storage bucket, server-verified upload, metadata stripping, thumbnails and short-lived protected image access; see [five-photo workflow and pipeline](WORKFLOW_AND_MEDIA_PIPELINE.md).

## 3. QR token protocol
- Generate cryptographically random opaque token of at least 128-bit entropy (e.g. 24 random bytes, URL-safe encoding).
- QR URL `https://<approved-domain>/v/<token>`. Never encode name, phone, government ID, or plate as query data.
- Store a one-way digest of the token server-side, compare by digest; rotate/revoke on lost/compromised sticker.
- QR landing must not expose vehicle/person via publicly cacheable HTML, redirect parameters, browser telemetry, third-party JS analytics or referrer; use safe referrer policy and minimize logs.
- Validate all token parameters; apply per-user and per-IP abuse controls with careful false-positive handling.
- QR use requires authenticated and authorized lookup; token by itself confers **no** read authority.

## 4. Authorization
Platform controls role mapping; app API and RLS enforce:
- `vehicle.access` to enter module
- `vehicle.read` to view metadata
- `vehicle.contact.read` to view full responsible contact and telephone
- `vehicle.create`, `vehicle.update` for operator
- `vehicle.qr.issue`, `vehicle.qr.revoke` for QR operator
- `vehicle.admin` for app management only in delegated scope

**Role proposal:** VIEWER → access/read/contact.read; OPERATOR → VIEWER + create/update/QR ops; APP_ADMIN → delegated administrative actions, no implicit global bypass.

Permission name is namespaced to this app; roles from other apps never count. Each server operation checks active user, active app grant, scope and target vehicle. Never trust `role`/`user_id` from frontend, and never expose Supabase service keys.

## 5. API contract sketch (must become OpenAPI before implementation)
- `POST /vehicle/qr/resolve` with `{ token }` → authorized record/details and allowed actions; `401/403/404` appropriately; no raw token in logs.
- `GET /vehicle/search?plate=...&province=...` → authorized minimal filtered results; query restrictions/rate limit; avoid PII leakage.
- `POST /vehicle` → operator creates validated record and contact link.
- `PATCH /vehicle/{id}` → operator updates with optimistic concurrency/audit.
- `POST /vehicle/{id}/qr` → operator rotates/issues identifier, returns printable URL once.
- `POST /vehicle/{id}/qr/revoke` → operator revokes identifier.
- `GET /me/apps` uses central framework to list authorized apps.

API examples above are logical endpoints; actual Supabase Edge Function routing may differ.

## 6. Camera
- HTTPS + explicit permission required.
- Use `navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'}}})` default; switching to `user` stops current tracks then starts fresh.
- Show available devices after permission granted; `deviceId` selection when supported.
- Use tested QR decode library; debounce repeated reads; stop tracks on page exit.
- `playsinline` for iOS; test Safari, Android Chrome, LINE WebView.
- If blocked/unavailable, native phone camera QR link and manual plate search remain available.
- Camera switching is a capability to validate on real devices, not a universal browser guarantee.

## 7. Secure data operations
- Supabase publishable browser key permitted only alongside audited RLS; service_role/server secrets solely on trusted backend.
- Contact field protection: avoid direct client SELECT on broad tables if contact permission differs from basic `vehicle.read`; expose security-definer function or Edge Function with strict permission checks and minimal response.
- PII audit logs must redact phone/token and have retention, read restrictions.
- Disable caching on sensitive lookup API and vehicle pages; define safe CSP/Referrer-Policy and avoid third-party analytics reading QR URL.
- Database migrations in repository; staging and prod isolated with dummy staging data.
- Consider risk that old printed QR cannot be redeemed after rotation; operator can reprint replacement.

## 8. Deployment and app integration
Register:
```json
{
  "app_id": "vehicle-contact",
  "name": "MT Vehicle Contact",
  "type": "internal",
  "route": "/apps/vehicle",
  "version": "1.0.0-draft",
  "permissions": [
    "vehicle.access",
    "vehicle.read",
    "vehicle.contact.read",
    "vehicle.create",
    "vehicle.update",
    "vehicle.qr.issue",
    "vehicle.qr.revoke",
    "vehicle.admin"
  ]
}
```

Deploy via reviewed GitHub Actions to approved HTTPS origin. The first app must integrate the already defined platform login and App Registry, not implement independent passwords.
