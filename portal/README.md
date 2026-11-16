# App Directory / GitHub Pages portal
This is the **source** for the central directory page. The published `docs/index.html` is generated and must not be edited directly.

- Registry: `apps.json` — contains only entries that are intentionally listed. Entries marked `poc` are prototypes, not live production applications.
- Template: `index.template.html`
- Generator: `node scripts/sync-pages.mjs` (from repository root); `--check` validates published artifacts.
- The QR scanner canonical code stays in `apps/vehicle-contact/poc/qr-scanner/index.html`. The generator copies it into the legacy `docs/qr-scanner-poc/index.html` Pages path.
- CI checks copies for drift. GitHub Pages must be configured to publish `main /docs`; the intended public directory URL is `https://idev006.github.io/MT-Agency-Super-App-Framework/`, **not verified as deployed**.
- Future apps: add their canonical source under `apps/<app-id>`, configure their build/deployment, and publish their actual URL to this directory only after the URL is checked. Do not expose private APIs, credentials or personal data.
