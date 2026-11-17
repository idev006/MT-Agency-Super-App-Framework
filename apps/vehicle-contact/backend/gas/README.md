# P6 Vehicle Contact — GAS Backend Bootstrap

**State:** SAFE BOOTSTRAP; **source pushed to GAS as 5-file bundle (Version 4)**, but Web App not published; protected data CRUD and sign-in intentionally disabled.

- Canonical source: this folder on GitHub (not Google Sheets cells).
- Google Sheets is the Phase 1 private datastore with one tab per logical table, provisioned in the owner's Drive project root.
- GAS runtime entrypoints: `src/entrypoints/WebApp.js`. API groups include `system.health` only; all protected operations fail closed.
- `src/infrastructure/persistence/sheets/SheetsSchemaRepository.js` validates table headers as an **admin-only** function; it never returns data rows to a public caller.
- Follow [central GAS Master Blueprint](../../../../blueprint/MASTER_GAS_BACKEND_API_BLUEPRINT.md) and [application-specific contract](../../docs/GAS_API_SPEC.md).

## Canonical schema sync (detect and propose only)
- GitHub [database.schema.json](../../schema/database.schema.json) is the single field definition authority. Build bundles that JSON into GAS-compatible code; Node 22 test imports the JSON with its required import attribute.
- Run the editor-only functions `verifyVehicleSchemaFromEditor()`, `inspectVehicleSchemaDriftFromEditor()` and `proposeVehicleSchemaChangeFromEditor()` after configuring the Apps Script project. Only **sheet names and header cells** are inspected. No PR, migration, scheduled trigger or changed column is created automatically.
- Any physical Sheets edit (including new columns) produces drift until the responsible reviewer signs off a change to the JSON SSOT and an approved migration. Never expose the inspector as an anonymous public API.

## GitHub Actions deployment to target Script ID
- **Manual, main-branch only:** [Deploy P6 Vehicle Contact GAS](../../../../.github/workflows/deploy-vehicle-gas.yml). An authorized maintainer must configure the `P6VC_CLASPRC_JSON` GitHub Actions secret (never in source/chat) and type `PUSH_VEHICLE_GAS` to dispatch.
- Target Apps Script ID is fixed in the workflow to the owner-provided project. Workflow runs `npm run check`, then `clasp push --force` and `clasp create-version`. No Web App deployment is published; the entire target Apps Script project source is replaced, so back up current GAS code first.
- **Current deployment status:** authenticated GitHub Actions source push verified [run 44034261629](https://github.com/idev006/MT-Agency-Super-App-Framework/actions/runs/44034261629), five namespaced GAS files and manifest, GAS version 4. Workflow restored to **manual-only**; no Web App /exec published. See [GAS GitHub Actions Deployment Runbook](../../docs/GAS_GITHUB_ACTIONS_DEPLOYMENT.md).

## Developer build and first script setup

```bash
cd apps/vehicle-contact/backend/gas
npm install
npm run check
# Open your existing target Spreadsheet in Google Sheets > Extensions > Apps Script
# Create a bound or standalone Apps Script Project. Record its Script ID.
# Set Script Property VEHICLE_SHEET_ID in Apps Script Project Settings.
# Configure clasp credentials in a secure workstation (never in Git).
# Copy .clasp.json.example to .clasp.json and replace Script ID.
clasp push
# Run verifyVehicleSchemaFromEditor() with authorized admin Google identity.
```

`clasp push` updates script code, not automatically a published versioned Web App. Do **not** publish the protected API or owner-privileged public endpoints until the auth/session gateway design and direct-URL bypass security gates pass. Script secrets and `.clasp.json` should be kept out of Git; the provided `.clasp.json.example` is safe sample configuration.

**Code packaging — Multi-File GAS:** canonical GitHub code uses JavaScript ES Modules. `npm run build` uses pinned esbuild to generate **five independently namespaced, self-contained GAS IIFEs**, each exposing exactly one allowed global entrypoint, plus `appsscript.json` in `dist/`. Files are named `ENTRY$WebGet.gs`, `ENTRY$WebPost.gs`, `ADMIN$VerifySchema.gs`, `ADMIN$InspectSchema.gs`, `ADMIN$ProposeSchema.gs`. Each compiled `.gs` must be at most **800 lines**; build fails closed if exceeded. This design deliberately duplicates some shared source code across generated runtime bundles rather than depending on GAS file ordering. Source imports are not executed in GAS. Contract tests execute all generated files in both forward/reverse order. Build itself never deploys; GitHub Actions handles controlled pushes.

**Important:** Google Drive connector supports the Sheet but currently cannot create or push an Apps Script Project. The Apps Script project must be created/authorized with the owner's Google account before any first `clasp push`.
