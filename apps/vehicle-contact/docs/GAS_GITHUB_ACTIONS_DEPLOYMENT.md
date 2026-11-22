# P6 Vehicle Contact — GitHub Actions → GAS Deploy Runbook

**Document ID:** P6VC-DEPLOY-001  
**Date:** 2026-11-17  
**State:** LATEST SOURCE PUSH VERIFIED 2026-11-22 — [run 45010301788](https://github.com/idev006/MT-Agency-Super-App-Framework/actions/runs/45010301788), commit `8fd9d3a`, **57 modules** pushed, GAS **version 50** created. NOT A WEB APP DEPLOYMENT; the published Web App remains **V49 / 0.9.2** (publication is a separate owner action). Full read-back evidence: [GAS Test Evidence — Version 50](GAS_TEST_EVIDENCE.md). First authenticated push: run 44033187307 (2026-11-17, commit `75c26b39`, version 3).
**GitHub SSOT:** [deploy-vehicle-gas.yml](../../../.github/workflows/deploy-vehicle-gas.yml)  
**Target GAS Script ID (provided by owner):** `1hgszMzlCLe5snPx7NY5fj-esZIIJDhXtiitTCXpgQRQKgqkBSXJyPvJX`  
**Script editor:** https://script.google.com/d/1hgszMzlCLe5snPx7NY5fj-esZIIJDhXtiitTCXpgQRQKgqkBSXJyPvJX/edit

## 1. Policy
GitHub source is the SSOT; GAS is only a deployed runtime artifact. The GitHub Actions workflow is **manual-only** via `workflow_dispatch`, **main-only**, and requires the exact typed confirmation `PUSH_VEHICLE_GAS`. There is no push-triggered automatic overwrite. One deployment job at a time, `cancel-in-progress: false`.

On a correctly configured runner, the workflow:
1. Checks out main with read-only repo permissions.
2. Installs Node 22, dependencies, builds the flattened multi-file bundle `dist/*.gs` + `dist/appsscript.json` and runs contract tests (`npm run check`).
3. Validates the generated artifact **dynamically**: one `.gs` per source `.js` plus one schema `.gs` (currently **57** = 56 sources + schema) and the manifest; every `.gs` non-empty and ≤800 lines; key entrypoints present; manifest `runtimeVersion:V8`.
4. Installs pinned `@google/clasp@3.4.1`.
5. Creates local `.clasp.json` with provided Script ID and rootDir `dist`; securely restores auth from a protected GitHub secret.
6. Runs `clasp push --force` (overwrites **all** source files in the target Apps Script Project).
7. Creates a version associated with GitHub SHA for source traceability, **not a Web App deployment**.
8. Writes GitHub Step Summary and deletes temporary clasp credentials.

**WARNING:** `clasp push` replaces the entire script source. Inspect and back up any pre-existing GAS code in this Script ID **before first invocation**. The workflow is not a merge, does not retrieve code from GAS, and does not automatically roll back a failed push. Do not manually edit production GAS code after the initial migration without reconciling back to GitHub.

## 2. One-time setup that must be done by an authorized user

A. Ensure `1hgszMzlCLe5snPx7NY5fj-esZIIJDhXtiitTCXpgQRQKgqkBSXJyPvJX` is the **correct project** and the Google account that authenticates `clasp` has Edit rights. Verify existing content/backups and whether the project is serving production users.

B. Enable the Apps Script API in the same Google account: https://script.google.com/home/usersettings

C. In a trusted local workstation with Node.js, run:

```powershell
npm install -g @google/clasp@3.4.1
clasp login
```

After successful OAuth login, `~/.clasprc.json` contains a credential including refresh token. **Never paste the credential into chat**, any GitHub issue, Google Sheet, or repository file.

D. In GitHub → Repository **Settings → Secrets and variables → Actions → New repository secret**, create:

| Secret name | Exact value |
|---|---|
| `P6VC_CLASPRC_JSON` | The full JSON content of the authorized local `~/.clasprc.json` |

Grant secret-management access only to appropriate maintainers and rotate the OAuth token if exposed. Repo-level secrets are usable by other workflows with sufficient write access to the repository, so for stronger isolation consider a protected deployment Environment with restricted branches/reviewers and an environment secret after verifying governance permissions.

E. Confirm that GAS Script Property `VEHICLE_SHEET_ID` is set to the existing intended private Google Sheets database ID. It is not inserted by `clasp push` and is unrelated to the Script ID. Ensure no real PII is present until the separate security and privacy release gates pass.

## 3. Manual run

1. Open [GitHub Actions → Deploy P6 Vehicle Contact GAS](https://github.com/idev006/MT-Agency-Super-App-Framework/actions/workflows/deploy-vehicle-gas.yml).
2. Select **Run workflow**, branch **main**.
3. Enter exactly `PUSH_VEHICLE_GAS` in the confirmation field.
4. Run and inspect steps; note the exact commit SHA and GAS version created.
5. Verify Apps Script Editor source matches the bundle (global entrypoints live at the bottom of `ENTRYPOINTS$WebApp.gs`; the editor does **not** auto-refresh after `clasp push` — press F5 first) and invoke admin-only schema inspection with an authorized Google identity.
6. Add actual evidence/commit/run ID and test results to [GAS Test Evidence](GAS_TEST_EVIDENCE.md) and the appropriate Agile Issue.

**First manual dispatch has succeeded according to GitHub Actions logs (2026-11-17); the following remains the safety checklist for future dispatches.** Before another run, check the destination project's backup and expected source. A missing `P6VC_CLASPRC_JSON` secret fails the workflow **before** `clasp push`.

## 4. What this does NOT do
- Does **not** publish, update or expose a Web App /exec deployment URL.
- Does **not** configure end-user login/session, RBAC, protection against direct GAS URL bypass or Google Drive media permissions.
- Does **not** auto-run on every commit, auto-approve production deployment, or migrate Google Sheets/Drive files.
- **First authenticated source push is evidenced** by GitHub Actions. It does **not** establish that old target code was independently backed up, that GAS editor verification succeeded, or that a public Web App was released.

## 5. Next improvement
Create separate approved staging and production Script IDs with isolated credentials and controlled GitHub Environments. Once staging is demonstrated, require environment reviewers and branch protection before any production source overwrite; release Web App deployments only after security/PDPA gates.

**References:** Google clasp CI/CD guide https://developers.google.com/apps-script/guides/clasp ; [Backend README](../backend/gas/README.md), [Roadmap](DEVELOPMENT_ROADMAP_PHASE1.md), [Agile Kanban](AGILE_KANBAN.md).
