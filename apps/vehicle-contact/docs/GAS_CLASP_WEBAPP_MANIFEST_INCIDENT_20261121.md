# GAS clasp redeploy — Web App 404 incident & webapp manifest fix

**Date:** 2026-11-21 (Asia/Bangkok)
**Severity:** Production DEV outage (live Web App returned HTTP 404 for ~all anonymous traffic)
**Status:** RESOLVED — live Web App **Version 41**, `system.health` `status:ready` / `backendVersion:0.9.0` verified via direct `/exec` and through the Worker; edge fail-closed **14/14 PASS**.
**Source fix:** `apps/vehicle-contact/backend/gas/appsscript.json` now declares the `webapp` block (branch `codex/p6vc-gas-webapp-manifest-fix-20261121`).

## Symptom

After the assistant self-deployed via clasp (`push --force` → `create-version` 40 → `update-deployment … -V 40`), the live Web App `/exec` URL returned:

```
HTTP 404
<title>ไม่พบเพจ</title>
ขออภัย ไม่สามารถเปิดไฟล์ได้ในเวลานี้
```

The Worker gateway consequently returned `{"error":"GATEWAY_UPSTREAM_ERROR"}` for `system.health`. **Both** deployments (`@HEAD` and the pinned live deployment) 404'd, which isolated the fault to the **project source/manifest**, not a per-deployment version setting.

## Root cause

`appsscript.json` (copied verbatim into `dist/` by `scripts/build.mjs:93`) had **no `webapp` configuration block**:

```json
{ "timeZone": "Asia/Bangkok", "runtimeVersion": "V8", "exceptionLogging": "STACKDRIVER", "oauthScopes": [ … ] }
```

Historically the Project Owner published the Web App **through the Apps Script editor** (Deploy → Manage deployments). The editor's Deploy dialog writes the web-app execution identity and access level (`executeAs` / `access`) into the project's manifest at publish time. That is why CI's deliberate **push + create-version only** workflow (`.github/workflows/deploy-vehicle-gas.yml`, "No Web App deployment was published") never broke access — the owner's editor publish re-established it.

`clasp push --force` **replaces** `appsscript.json` with the repo copy. Because the repo copy lacked `webapp`, the push **wiped the anonymous-access configuration**. `clasp update-deployment` then repointed the deployment at a version whose manifest no longer granted anonymous access → every anonymous `/exec` request 404'd. clasp's deploy path does **not** re-add the editor-managed access settings the way the editor Deploy dialog does.

## Solution (fix-forward, permanent)

Declare the web-app contract explicitly in the source manifest so any clasp push/publish preserves it:

```json
"webapp": {
  "executeAs": "USER_DEPLOYING",
  "access": "ANYONE_ANONYMOUS"
}
```

- `executeAs: USER_DEPLOYING` — the Web App runs as the deploying owner, so it can read/write the owner's Google Sheets (the Worker cannot supply owner Sheets credentials).
- `access: ANYONE_ANONYMOUS` — the Cloudflare Worker calls `/exec` without a Google identity; anonymous access is required. Authorization is still enforced **inside GAS** (server-authoritative RBAC, fail-closed) and at the Worker edge (Origin lock + operation allowlist + DTO/session validation).

Steps executed:

1. Add `webapp` block to `apps/vehicle-contact/backend/gas/appsscript.json`.
2. `npm run build` → `dist/appsscript.json` now contains `webapp` (verified).
3. `clasp -u p6vc push --force` (53 files).
4. `clasp -u p6vc create-version` → **Version 41**.
5. `clasp -u p6vc update-deployment AKfycby15c-… -V 41`.
6. Verify: direct `/exec` GET → `200 {"ok":true,…,"status":"ready","backendVersion":"0.9.0"}`; Worker `system.health` → same; `verify-live-worker-failclosed.mjs` → **14/14 PASS**.

Version 41 snapshots the hardened `main` source (`ab83384`: B1 org-cycle check, B4 login constant-work, B2 submit reconciliation, C1 `changePending.proposedDelta`), so the live Web App now serves the hardening fixes **and** restored anonymous access in one publish.

## Best practices (team SSOT)

1. **The manifest is the source of truth for web-app access.** Never rely on editor-only Deploy-dialog settings surviving a `clasp push`. Any project deployed via clasp/CI MUST declare `webapp.executeAs` + `webapp.access` in `appsscript.json`.
2. **`clasp push` is destructive to the manifest.** It overwrites `appsscript.json` wholesale. Diff the manifest before/after a push when changing deploy tooling.
3. **Push + version ≠ publish.** CI intentionally stops at `create-version` (traceability) and leaves publication to a controlled step. When the assistant self-publishes via `update-deployment`, the manifest must already carry the access contract.
4. **Isolate 404 scope fast.** Probe a second deployment (`@HEAD`) on the same project: if it also 404s, the fault is project-wide (source/manifest), not a single deployment's version pin.
5. **Restore service before forward diagnostics.** A redeploy to a known-good version is the first lever; here the known-good version shared the same deficient manifest, so the manifest fix-forward was the correct restoration path.
6. **Verify through the real path.** Confirm health both directly at `/exec` and through the Worker gateway (the production traffic path), plus the credential-free edge fail-closed suite, after every publish.
7. **No secrets in deploy artifacts.** `.clasp.json` (scriptId + rootDir only) and `.clasprc.json` are gitignored; clasp credentials live in the named profile (`-u p6vc`), never in the repo, docs, logs or chat.

## Residual / owner gates

- Authenticated B1/B4/B2 negative probes and C1 `proposedDelta` live acceptance still require the gitignored DEV `.env` secrets (owner-action). The hardened **source is live** (v41 from `ab83384`); health + edge are verified credential-free.
- This fix is merged to `main` so future CI pushes and assistant self-deploys preserve anonymous access automatically.