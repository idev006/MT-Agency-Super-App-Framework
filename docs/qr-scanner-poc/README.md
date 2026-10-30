# MT QR Scanner POC — Mobile Browser

**Test page source:** [index.html](index.html)
**Target GitHub Pages URL (only after activation):** https://idev006.github.io/MT-Agency-Super-App-Framework/qr-scanner-poc/

## Publishing
Repository Settings → Pages → Build and deployment → Source: Deploy from a branch → Branch: `main` → Folder: `/docs` → Save. Wait for GitHub Pages deployment to complete and check the target URL in mobile Chrome/Safari. If the repository already has a different Pages setup, do not overwrite without reviewing it. Requires repository admin. The repo is public and this test page deliberately contains no actual car/owner/phone data.

## How to test
1. Open the deployed HTTPS URL in Android Chrome or iPhone Safari.
2. Tap **เปิดกล้อง** and allow camera. Default is rear (`environment`).
3. Point at a harmless test QR code, see the decoded result (shown as text only, no automatic navigation).
4. Tap **สแกนใหม่**, then **สลับกล้อง** and test repeated transitions.
5. Try the camera device selector if supported by browser.
6. Tap **ปิดกล้อง**; ensure OS camera indicator stops.
7. Deny permission, reload, test error response. Try opening same URL from LINE in-app browser and note differences.

## POC gate
Record OS/browser versions, rear camera, front/back switch, QR decode, permission handling, camera shutdown and native camera URL-opening. Do not assume every multi-camera phone exposes all physical lenses. If front camera switching is unreliable, use rear-only in v1.

## Safety/limits
No user identity, spreadsheet, backend or personal data; no scan logs sent to server; jsQR library is loaded from a public CDN only as fallback when native `BarcodeDetector` unavailable, requiring internet. QR results are not opened automatically. This tests standalone HTTPS frontend, **not** camera access in the GAS iframe. Do not publish actual QR codes containing private information in issue reports.
