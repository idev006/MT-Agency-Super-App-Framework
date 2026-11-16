# Central App Directory (SSOT)
The directory source is `portal/apps.json` and `portal/index.template.html`. Application source is **only** in `apps/<app-id>/`; do not maintain copies in `docs/`.

## Build and deploy
Run `node scripts/build-pages.mjs _site` to generate a disposable deployment artifact. The GitHub Actions workflow `.github/workflows/deploy-pages-ssot.yml` builds and deploys `_site/` via GitHub Pages Actions; no generated content is committed to Git.

**One-time setup:** Repository Settings → Pages → Build and deployment → Source = **GitHub Actions** (not “Deploy from a branch”). Without this switch, the legacy `main/docs` Pages source will not serve the new app page.

- Directory: https://idev006.github.io/MT-Agency-Super-App-Framework/
- Scanner canonical route: https://idev006.github.io/MT-Agency-Super-App-Framework/apps/vehicle-contact/poc/qr-scanner/
- Old `/qr-scanner-poc/` receives a redirect in the deployed artifact only, not in Repository.

Only list actual intentional apps in `apps.json`. Prototype labels must not imply production authorization or data availability.
