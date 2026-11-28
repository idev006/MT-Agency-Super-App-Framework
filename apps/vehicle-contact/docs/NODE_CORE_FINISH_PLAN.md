# Node core — finish: the whole backend as native async Node.js (VC-ADR-051)

**Progress (2026-11-28, refreshed):** 24/64 operations live on the core at backend 0.9.66 (N1a done; N1b PRs 1–2 done; Worker
deleted — W1; GAS = photo bridge only — G1). Current status: [CURRENT_DELIVERY_STATUS.md](CURRENT_DELIVERY_STATUS.md); the
"Today (0.9.56)" diagram below is the starting point, kept for history. `system.health` remains on the legacy engine until N4 so the deploy smoke still
checks the published backend version end to end. Owner clarification: map code with LSP; target runtime is the native async
Node core, Firestore and the GAS API for Google Drive photos, without Cloudflare Worker.

Owner, 2026-11-27: *"อย่าเสียเวลายื้อเลย เราควรเปลี่ยนโค้ด backend core ให้เป็น nodejs 100% เพื่อใช้ประสิทธิภาพของมันได้อย่างเต็มที่"*
→ approach change proposed → *"อนุมัติให้ดำเนินการ โดยคุณและทีมต้องวิเคราะห์ วางแผนการดำเนินการ เพื่อให้ tracking ได้"*.

## What changes in the approach
Until now each operation moved as a **shared flow** (one generator both engines run) and was proven byte-identical on both
engines — safe but slow (6 waves, 16 of 64 operations). From here: **the legacy engine is frozen** (no new shared flows,
no dual-engine parity per operation). The remaining use cases are rewritten as **native async modules in
`backend/core/src/use-cases/`** (async/await, independent reads in parallel with `Promise.all`, transactions on the core
store), moved in a few large groups, then the legacy engine and the GAS API are deleted.

**Unchanged:** every merge and every deploy needs the owner's OK; every deploy is proven by the live suite through the core
(126 tests covering all 64 operations) + DATA_PROOF fresher than the suite; until N4 any group can be switched back to the
legacy engine (remove its operations from the core's operation table and redeploy the core).

## Analysis (2026-11-27)

| Module (backend/gas/src/application/…) | Lines | Store call sites | Transactions | Journal | Operations left |
|---|---|---|---|---|---|
| use-cases/VehicleOperations.js (+ ChangeReviewOperation, QrExport/QrHistoryOperation) | 355 | 65 | 1 | 8 | 16 |
| use-cases/MediaRetentionOperations.js | 153 | 33 | 2 | 1 | 10 |
| use-cases/IdentityOperations.js (users.*) | 152 | 32 | 4 | 7 | 7 |
| use-cases/AdministrationOperations.js | 106 | 19 | 5 | 0 | 8 |
| use-cases/VehicleListOperations.js | 123 | 9 | 2 | 0 | 2 |
| use-cases/SystemResetOperations.js, settings/SettingsRegistry.js, system.health | 161 | 12 | 1 | 0 | 5 |
| **total** | ≈ 1,050 | 170 | 15 | 16 | **48** |

Cross-cutting rules the core must also apply on every write: the **Log Manager** (already on the core store) and the
**QR print-state rule** (VC-ADR-042: a new ACTIVE QR resets the print state — `withPrintStateStore`), plus the sticker
decorations of registrations.detail / review, vehicles.update / list / listMine, qr.export (folded into the use cases).
Known performance debts fixed on the way: registration approval reads the WHOLE vc_vehicles table (→ query by plate).

**Test strategy:** the ~900 legacy acceptance tests are the specification. A script **generates** async copies of them
(`h.call(` → `await h.call(`, …) that run against the core facade over an async in-memory store with the same seeds, fake
Drive and fake security; a check (CI) fails if a generated copy is stale. So the core is held to the same tests without
hand-kept duplicates.

## The work (one issue each, milestone "Node core (VC-ADR-046)")

| # | Scope | Operations | Done when |
|---|---|---|---|
| **N1a** | foundation: async test harness + generated async acceptance tests; async store rules (print state); the core's use-case table; vehicles.list, qr.markPrinted, system.config.get/update, system.reset.*; system.health remains on legacy until N4 | 6 in N1a + health at N4 | generated tests for the six N1a operations pass on the core; live suite 126/126 through the core with these answered by the core |
| **N1b** | vehicles, QR, change requests, registration review (VehicleOperations + ChangeReview + QR export/history), approval duplicate check by plate | 16 | same, + approve → vehicle / contact / photos / QR rows read back; photo folder organized |
| **N2** | photos.list / replace, registrations.photo, retention.*, audit.query / export | 10 | same, + retention on synthetic DEV only, dry run first |
| **N3** | users.* (one hash rule, revocation), organizations.*, campaigns.create / list / revoke | 15 | same, + audit rows read back |
| **N4** | cut-over: the web app calls the core's /api/frontend directly (Worker retired), p6vc-api deleted, legacy use-case code deleted, GAS = photo bridge only (needs R10 / R11 jobs), shared code settled in the core | – | live suite + DATA_PROOF + live UI; GAS bundle ≈ bridge files only; no forwarding path left |

Order: N1a → N1b → N2 → N3 → (R10, R11) → N4. Each item: PR(s) → owner OK → deploy → proof → evidence in DECISION_LOG
→ issue closed → ROADMAP status updated.

## Blueprint (diagrams)

### 1. Today → target
```mermaid
flowchart LR
  subgraph today["Today (0.9.56)"]
    B1[Web app<br/>GitHub Pages] --> W[Cloudflare Worker]
    W --> L[p6vc-api<br/>legacy engine, sync<br/>concurrency 1]
    C1[p6vc-core<br/>async Node<br/>16 of 64 ops] -. forwards 48 ops .-> L
    L --> F1[(Firestore)]
    C1 --> F1
    L --> G1[GAS web app<br/>photo bridge + old API]
    C1 --> G1
    G1 --> D1[(Google Drive<br/>photos)]
  end
  subgraph target["Target (after N4)"]
    B2[Web app] --> C2[p6vc-core<br/>async Node<br/>64 of 64 ops]
    C2 --> F2[(Firestore)]
    C2 --> G2[GAS<br/>photo bridge only]
    G2 --> D2[(Google Drive<br/>folder per vehicle)]
    B2 -. photos by link .-> D2
    J[Cloud Run Jobs<br/>housekeeping, audit, seed, admin tools] --> F2
    J --> G2
  end
```

### 2. Inside the core (dependencies point inwards; only the http-client calls out)
```mermaid
flowchart TB
  H[http<br/>routing, /api/frontend] --> FA[facade<br/>route checks, DTO, session, error codes]
  FA --> UC[use-cases<br/>async modules, N1a–N3]
  FA --> FL[shared flows<br/>officer path, auth, registration]
  UC --> DOM[domain<br/>policies: hash, photo policy, layout, lifecycle, log]
  FL --> DOM
  UC --> P[ports<br/>Store, MediaStore, PasswordHasher, LegacyEngine]
  FL --> P
  AD[adapters<br/>Firestore gRPC store + transactions,<br/>photo bridge, node:crypto, runtime monitor] -. implements .-> P
  AD --> HC[http-client<br/>timeout, retry, breaker]
  ROOT[server.mjs / main.mjs / job.mjs<br/>composition root] --> H
  ROOT --> AD
```

### 3. An officer opens a vehicle (after N4)
```mermaid
sequenceDiagram
  participant B as Browser
  participant C as p6vc-core
  participant F as Firestore
  participant D as Google Drive
  B->>C: vehicles.detail (session token)
  C->>F: session + vehicle + sticker list (round 1)
  C->>F: contacts, photos, policy, labels, QR + access-log row (round 2, one commit)
  C-->>B: vehicle + photo links (thumbUrl, fullUrl)
  par 5 thumbnails at once
    B->>D: drive.google.com/thumbnail?id=…&sz=w320
    D-->>B: image
  end
  B->>D: full size on tap (sz=w1600)
```

### 4. A photo's life
```mermaid
sequenceDiagram
  participant P as Phone (public form)
  participant C as p6vc-core
  participant G as GAS bridge
  participant D as Drive
  participant F as Firestore
  P->>P: resize to the admin photo policy
  P->>C: photos.upload
  C->>C: size check from the file header (PHOTO_TOO_LARGE)
  C->>G: upload (signed)
  G->>D: file in the photos folder, shared by link
  C->>F: staging row (STAGED)
  P->>C: registrations.submit (5 photo ids)
  C->>F: one commit: request, CLAIMED photos, quota, idempotency
  Note over C,F: registration admin approves (N1b on the core)
  C->>F: vehicle, contact, photos, QR (one commit)
  C->>G: organize (signed)
  G->>D: รถ/province/plate · id/FRONT.jpg … shared by link
  C->>F: vehicle.photo_folder_id
  Note over D: daily job trashes unclaimed uploads > 7 days
```

### 5. Work order and gates
```mermaid
flowchart LR
  R02[R02 photo links<br/>0.9.56] --> N1a[N1a foundation<br/>+ 7 ops]
  N1a --> N1b[N1b 16 ops<br/>vehicles, QR, review]
  N1a --> N2[N2 10 ops<br/>photos, retention, audit]
  N1a --> N3[N3 15 ops<br/>users, orgs, campaigns]
  N1b --> N4
  N2 --> N4
  N3 --> N4
  R10[R10 seed job] --> N4
  R11[R11 admin jobs<br/>security OK] --> N4
  N4[N4 cut-over<br/>Worker off, legacy deleted,<br/>GAS bridge only] --> GL[Go-live checklist<br/>R14 capacity, R16, R17]
  classDef gate fill:#fff3cd,stroke:#b08800
  class N4,GL gate
```
Every box: PR → owner OK → deploy → live suite + DATA_PROOF + read-back → evidence → issue closed.
