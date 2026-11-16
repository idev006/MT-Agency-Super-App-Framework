# QR Scanner POC — Vehicle Contact
**Canonical source:** [index.html](index.html) (moved from `docs/qr-scanner-poc/index.html` without changing its contents or camera behavior).

This is a **standalone HTML/JavaScript diagnostic prototype**, not yet converted to Vue 3/Vite multi-layer application code. Its source belongs to the Vehicle Contact app; see [test evidence](../../docs/POC_QR_SCANNER.md) and the [app README](../../README.md).

## Publishing / compatibility
The previous GitHub Pages file at `docs/qr-scanner-poc/index.html` is retained as a **legacy deployment mirror** because GitHub Pages may currently publish from `main/docs`. Do not edit the mirror as the canonical source. Before removing it, implement a deployment workflow that copies the canonical file into the Pages artifact and verify the old URL on Android/iOS.

**Legacy test URL (requires enabled Pages):**
https://idev006.github.io/MT-Agency-Super-App-Framework/qr-scanner-poc/

## Verification
Camera opened on Android and iOS according to owner (2026-10-30). Successful decoding, switching and lifecycle cases still require documented real-device evidence. No production contact lookup, authorization or database exists in this POC.

## Next integration
Convert this proof of concept into Vue 3 presentation/application/domain/infrastructure modules; only after device regression tests replace the published mirror with generated deploy output.
