# Central Portal / GitHub Pages deployment verification

**Last reviewed:** 2026-11-17 (Asia/Bangkok)  
**Source branch:** `main`  
**Status:** BLOCKED — deployment from GitHub Actions not yet proven; do not mark production-ready.

## Confirmed
- Canonical scanner source: `apps/vehicle-contact/poc/qr-scanner/index.html`.
- Canonical portal registry: `portal/apps.json`.
- Build script: `node scripts/build-pages.mjs _site`.
- Validation: `node scripts/validate-ssot.mjs` and `node scripts/validate-ssot.mjs --built _site`.
- Committed `docs/qr-scanner-poc/` source was removed; legacy route is generated only in `_site/`.
- Deployment workflow: `.github/workflows/deploy-pages-ssot.yml`.
- PR-only validation workflow: `.github/workflows/validate-ssot.yml`.

## GitHub evidence
- Previous deployment run: https://github.com/idev006/MT-Agency-Super-App-Framework/actions/runs/43800767675 — **failure**.
- After build workflow improvements: https://github.com/idev006/MT-Agency-Super-App-Framework/actions/runs/43988446571 — **failure**, build job `steps=[]`, `runner_id=0`, and deployment job skipped.
- **Inference limit:** No steps were reported, so this does not prove a JavaScript build/test failure. Runner provisioning, Actions settings, account limits, workflow policy, or other GitHub control-plane issues require inspection by a repository maintainer. No root cause asserted.

## Maintainer checklist
1. Open Actions → latest **Build and deploy Pages from SSOT** run; inspect GitHub's job banner, annotations and usage/billing or Actions policy notices.
2. Confirm repository Settings → Actions allows the required actions and GitHub-hosted runners.
3. Confirm repository Settings → Pages → **Build and deployment → Source: GitHub Actions** (the old branch-based Pages build may otherwise publish outdated content).
4. Verify Pages environments and Actions permissions; do not add tokens or secrets to the public repository.
5. Re-run failed workflow only after the configuration is verified. Require an actual green **build** and **deploy** before closing this blocker.
6. Open the central directory and canonical scanner URL in a browser; confirm rendered content, redirect, and QR camera permission on physical Android/iOS devices.
7. Record final run URL, commit SHA, tested URL, observed device/browser results and reviewer in this file.

## Publishing acceptance criteria
- CI reports successful validation/build and deploy at a specific SHA.
- Generated QR page byte-for-byte matches canonical scanner source.
- Central app directory and old scanner URL redirect both resolve as intended.
- No production personnel/vehicle contact data leaks through public Pages.
- Real-device camera/decoding evidence belongs in `apps/vehicle-contact/docs/POC_QR_SCANNER.md`.
