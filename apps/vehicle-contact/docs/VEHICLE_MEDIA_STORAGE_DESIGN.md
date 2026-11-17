# P6 Vehicle Contact — Phase 1 Vehicle Media Storage Design

**Document:** P6VC-MEDIA-001  
**Updated:** 2026-11-17  
**Status:** PHYSICAL MEDIA ROOT SELECTED AND BASE DIRECTORIES CREATED. Registration upload pipeline, storage privacy/release controls, minimum required photos, and automated per-vehicle folders remain TO DO / subject to approval.  
**Root:** Google Drive Project Root [p6-vehicle-contact](https://drive.google.com/drive/folders/1bqnA4Ih_mki0xmHwp8A7r14UYuw8m22G)  
**Authoritative upload root:** Google Drive [uploads](https://drive.google.com/drive/folders/1H_gIVF04LfLlgDRvOApcrY835Rd4LGEW) (ID `1H_gIVF04LfLlgDRvOApcrY835Rd4LGEW`). This is an app configuration locator, **not a password, secret or permission grant**.  
**Google Sheets:** Stored separately in the project root; 6 logical worksheets for vehicle/contact/QR/photo-metadata/audit. Canonical schema remains [GitHub database.schema.json](../schema/database.schema.json).

## 1. Verified current physical folder structure

```text
p6-vehicle-contact/                     # existing project root
├── P6 Vehicle Contact — Phase 1 Database  # existing Google Sheet
└── uploads/                           # given/approved media root
    ├── vehicles/                      # CREATED
    ├── staging/                       # CREATED
    └── quarantine/                    # CREATED
```

| Location | Drive ID | Status |
|---|---|---|
| `uploads/` | `1H_gIVF04LfLlgDRvOApcrY835Rd4LGEW` | Verified existing folder |
| `uploads/vehicles/` | `19nEx4fadh8uJuv6ZzpqyQGZuJsnpy-MJ` | Created |
| `uploads/staging/` | `1W3LUZ22eLwK1S4OturNKY1vWc22oc8FW` | Created |
| `uploads/quarantine/` | `1menbLeAYBu1ayJpcJI3eHEZby2WQI6hJ` | Created |

**No individual vehicle folders/photos have been created or moved.** The folder structure below is a target for future registration workflow, not a claim of implementation.

## 2. Proposed per-vehicle layout (create on demand)

```text
uploads/vehicles/{vehicle_id}/
    front/
    rear/
    left/
    right/
    three_quarter/
```

- Generate an opaque, stable `vehicle_id` before any upload; never use license plate, personal name, phone or a changing property as a folder name. Do not infer registration or contact from a folder path.
- Each one of five photo slots contains a current approved/ready rendition and optional versioned assets; **file/folder IDs**, not names, are authoritative for lookup. A more compact single-folder-per-vehicle model can be approved if Drive performance/quota tests warrant it.
- Optional source file naming convention: `{slot}_v{version}_{opaque-id}.webp`, and thumbnail `{slot}_v{version}_{opaque-id}_thumb.webp`. Filename cannot confer authorization.
- `staging/` is for unverified temporary uploads; `quarantine/` holds rejected items subject to restricted handling and retention policy. Neither is publicly accessible.
- Avoid uncontrolled growth: a new vehicle consumes up to six folders in this candidate layout. Benchmark folder creation/quota/performance and simplify before production if necessary.

## 3. Workflow (planned, not yet coded)

1. Authorized operator enters plate/province, primary reachable contact; server validates permissions and creates DRAFT vehicle with stable `vehicle_id`.
2. Frontend offers five ordered slots: FRONT, REAR, LEFT, RIGHT, THREE_QUARTER (45°). Capture/retake and show preview before upload.
3. Backend authorizes per-vehicle and slot upload, places candidate in `staging/`, validates actual file signature, MIME/size/dimensions, orientation, malware considerations, and removes EXIF geolocation. Never trust frontend metadata alone.
4. Generate protected optimized image + thumbnail, create target folder as needed, store Drive file ID and media metadata in `vc_vehicle_photos`; mark READY only after verification and consistency checks.
5. On replacement: create new version → validate → switch current pointer with conflict checks → archive/clean old version only under signed-off retention policy.
6. Authorized vehicle lookup fetches photo only through approved secure mediation; direct Drive URLs are not security controls. Avoid public link-sharing or leaking file IDs as proof of entitlement.
7. QR creation and vehicle ACTIVE policy are distinct from upload; **mandatory minimum photo count remains OPEN** (one required versus 0–5 optional in conflicting sources). No new mandatory-five rule is adopted merely because UI shows five slots.

## 4. Metadata, SSOT and integrity

- `vc_vehicle_photos` currently has `photo_id,vehicle_id,slot,storage_ref,mime_type,size_bytes,status,version,created_at`. These fields are provisionally defined in the [canonical Schema](../schema/database.schema.json).
- **Do not directly add `drive_file_id` or `drive_folder_id` to the operational Sheet without reviewed schema change.** Initially `storage_ref` can be a controlled provider-specific reference, or a reviewed migration may add explicit fields.
- Track slot enum, status PENDING/READY/FAILED/ARCHIVED (final enum pending review), MIME/signature/size, uploader, created/updated timestamps, and access policy in data dictionary and migrations.
- Consistency risk: Google Drive writes and Google Sheet row writes cannot be a single ACID transaction. Implement resumable/reconciled state machine; failed uploads do not create broken READY records.
- The selected upload folder ID is a **project-specific configuration value**, separate from the GAS master blueprint; use Script Properties, not a hard-coded API business rule.

## 5. Access control and security gates

- Folder metadata currently indicates that the parent `uploads` is shared with a reader; **sharing inheritance and effective access for child files must be reviewed**. Do not assume that only the app/authorized roles can view photos.
- **No real personal vehicle photos** should be uploaded before auditing effective Drive sharing, service identity, image privacy, data controller/DPO review, retention, and secured non-bypassable GAS API access.
- App user Authentication/Authorization must be independent of Drive folder names and URL secrecy. Publicly accessible GAS /exec deployed as owner cannot be protected only by a gateway if direct calls bypass it.
- QR URL carries only opaque token; no PII or public photo link.
- Folder creation and move operations need idempotency, deduplication, quota controls and audit.

## 6. Next tests/decisions

- Confirm policy for 5 slots versus 5 mandatory photos, and approve private storage provider/Drive access model.
- Build Drive media adapter behind domain port, five-slot upload state machine and fake Drive tests.
- Test upload retries, timeout, replace, EXIF stripping, cross-user unauthorized reads, thumbnail access, Drive quota and backup/restore using synthetic assets.
- Recheck effective permissions/child inheritance before staging or pilot, with actual Google identity used by GAS.
- Link implementation to [Development Roadmap](DEVELOPMENT_ROADMAP_PHASE1.md) and [Requirements Traceability](REQUIREMENTS_TRACEABILITY.md).

**Historical draft note:** [WORKFLOW_AND_MEDIA_PIPELINE.md](WORKFLOW_AND_MEDIA_PIPELINE.md) describes a Supabase Storage candidate. For Phase 1 the location selected by the owner is the Google Drive `uploads` folder; do not silently deploy the obsolete private Supabase bucket design.
