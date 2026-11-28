# GAS project file reduction — candidate and publication gate

**Status:** DONE 2026-11-28 — the GAS project is the photo bridge only (GAS @117: `MediaBridge.gs` + `appsscript.json`); the deploy chain pushes the bridge by default (#348); `--full-api` + RESTORE_GAS_API_FILES is the rollback. Evidence: DECISION_LOG VC-ADR-053. The sections below are the plan as it was carried out.

Owner direction 2026-11-28: use `clasp` to manage GAS source; the deployed GAS project should contain only a few files. Track as [#329](https://github.com/idev006/MT-Agency-Super-App-Framework/issues/329) and VC-ADR-053.

## Verified current state

- The pinned `deploy-vehicle-gas.yml` runs `npm run check`, then `clasp push --force` from `backend/gas/dist`. `scripts/build.mjs` mirrors **every** `backend/gas/src/**/*.js` module to a `.gs` file and adds the schema module. `clasp status` and the local artifact show **60 `.gs` files**. The current `WebApp.js` reaches **59 source modules** because its HTTP API and 12 editor/trigger entrypoints remain in that project.
- The signed photo bridge itself reaches only **3 source modules**: `DrivePhotos.js`, `MediaBridgeSignature.js`, `MediaBridgeServer.js`.
- The old GAS API is no longer the browser path (FE 0.9.23 calls `p6vc-core`); `p6vc-api` Cloud Run still runs the frozen legacy code during N1b–N3. Editor reference seed and admin provisioning/reset jobs have not yet moved (R10 #303, R11 #304). Removal of the old `dailyDrivePhotoHousekeeping` GAS trigger has not been independently confirmed.

## Local candidate, not published

`backend/gas-bridge/src/WebApp.js` adds a bridge-only `doGet` health and `doPost` signed-media route. `node apps/vehicle-contact/backend/gas/scripts/build-bridge-candidate.mjs` bundles its 5 source inputs (the entrypoint, the 3 media modules and package version) to **one 14.6 KB `MediaBridge.gs`** plus `appsscript.json`. The generated artifact is ignored by git. The script writes `backend/gas-bridge/test-results/gas-bridge-dry-run.json` with the exact current file names that a candidate publication would remove and the 12 editor/trigger entrypoints it would drop; the reviewable snapshot is [GAS_BRIDGE_DRY_RUN_20261128.json](generated/GAS_BRIDGE_DRY_RUN_20261128.json). It calls no clasp mutation. VM tests prove health, signed upload/read/trash, rejection of ordinary API calls, and rejection of unsigned/tampered calls before Drive access.

## Gates before changing the remote GAS project

**Status 2026-11-28 (VC-ADR-056):** gate 3 and the gate-5 mechanics are built — `scripts/verify-bridge-live.mjs` (GET health of the pinned web app: which artifact answers + its version; the signed operations are proven by the photo-audit job and the live suite through the core) and a bridge-only push path: `deploy-vehicle-gas.yml` input `artifact=bridge` + `remove_api_files=REMOVE_GAS_API_FILES`, or `scripts/p6vc-deploy-backend.sh --bridge-only` with `P6VC_OWNER_OK_REMOVE_GAS_FILES=REMOVE_GAS_API_FILES` (records the pinned version before, checks after, prints the rollback). Done: **R11** (core job `admin-tools`, RESET_PREVIEW proven live on 0.9.66, VC-ADR-057) and **gate 2** (the owner deleted the `dailyDrivePhotoHousekeeping` trigger, 2026-11-28). Waiting for: **gate 4** (owner confirms the removal of the 59 other files / 12 editor functions listed by the dry run).

1. Move R10 reference seed and R11 first-admin/admin reset to reviewed core jobs, preserving their current security gates. R10 has a native async core job with an in-Firestore journal, local dry-run/apply/recover tests, and a manual dry-run/apply workflow. Its live DRY_RUN execution succeeded on backend 0.9.63 (independent Firestore COUNT 645). Recovery is not exposed by the workflow because it permanently removes rows. Confirm whether any other editor entrypoint is still needed, including photo audit/config inspection and the password diagnostic.
2. Confirm the old GAS daily housekeeping trigger is removed or migrate its scheduling without overlap. Keep the Cloud Run housekeeping job proof.
3. Replace the old GAS full-API publish verification with a signed bridge smoke and the full core suite + independent Firestore DATA_PROOF. The current GAS verifier still expects the old API and would fail against bridge-only code.
4. Review the dry-run file list and obtain the owner's **separate confirmation for remote source removal**. VC-ADR-052's one-time synthetic DEV approval excludes permanent deletes.
5. With green CI, record the current clasp deployment/version for rollback, run `clasp status` on the candidate, then `clasp push --force`, create a version and pin the web app to it. Verify bridge operations and core suite/read-back before marking PASS. If proof fails, pin the previous version. Never print script properties, tokens, passwords or pepper values.

The candidate deliberately stays outside the current `backend/gas/dist` and deployment workflow until these gates pass. A routine backend deploy still pushes the existing 60-file artifact.
