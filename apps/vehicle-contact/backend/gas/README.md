# P6 Vehicle Contact — GAS Backend Bootstrap

**State:** SAFE BOOTSTRAP; not deployed; data CRUD and sign-in intentionally disabled.

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
- **Current deployment status:** workflow and runbook added to GitHub; no Google account OAuth Secret was configured by this change and no push was performed or proven. See [GAS GitHub Actions Deployment Runbook](../../docs/GAS_GITHUB_ACTIONS_DEPLOYMENT.md).

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

**Code packaging:** canonical GitHub code uses JavaScript ES Modules; `npm run build` uses pinned esbuild to bundle imports into a GAS V8-compatible IIFE named `P6VC`, exports only global `doGet`, `doPost`, and admin-only `verifyVehicleSchemaFromEditor`, and copies `appsscript.json` into `dist/`. The runtime does not load source `import/export` files directly. Run `npm install`, then `npm run check` before configuring clasp. No cloud deployment is performed by this build.

**Important:** Google Drive connector supports the Sheet but currently cannot create or push an Apps Script Project. The Apps Script project must be created/authorized with the owner's Google account before any first `clasp push`.
