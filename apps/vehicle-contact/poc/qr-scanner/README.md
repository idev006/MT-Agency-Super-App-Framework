# QR Scanner POC — Vehicle Contact
**Canonical source:** [index.html](index.html) (moved from `docs/qr-scanner-poc/index.html` without changing its contents or camera behavior).

This is a **standalone HTML/JavaScript diagnostic prototype**, not yet converted to Vue 3/Vite multi-layer application code. Its source belongs to the Vehicle Contact app; see [test evidence](../../docs/POC_QR_SCANNER.md) and the [app README](../../README.md).

## Publishing / SSOT
The **only** QR Scanner HTML source is [index.html](index.html). GitHub Actions builds an ephemeral Pages artifact from this source; **no duplicate** `docs/qr-scanner-poc/` directory is kept in Git. The Pages source setting must be **GitHub Actions**.
Intended deployed route: https://idev006.github.io/MT-Agency-Super-App-Framework/apps/vehicle-contact/poc/qr-scanner/
The legacy `/qr-scanner-poc/` URL is redirected by the deployment artifact when Actions-based Pages is active.

## Verification
Camera opened on Android and iOS according to owner (2026-10-30). Successful decoding, switching and lifecycle cases still require documented real-device evidence. No production contact lookup, authorization or database exists in this POC.

## Next integration
Convert this proof of concept into Vue 3 presentation/application/domain/infrastructure modules; only after device regression tests replace the published mirror with generated deploy output.
