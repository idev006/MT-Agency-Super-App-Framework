# POC — QR Scanner on Android & iOS

**Status:** PARTIAL POC PASS — real-device camera access confirmed by project owner for Android and iOS; QR decoding and detailed device matrix not independently verified | **Date:** 2026-10-30 | **Owner:** MT Vehicle Contact
**Decision to validate:** rear camera by default, optional front/back switch, and optional device selector.

## POC Result — 2026-10-30 (User-confirmed)

**Result:** Project owner confirmed the POC can now access/use the camera on **both Android and iOS phones**. This closes the earlier camera-access blocker for the devices used in this test. Evidence source: user feedback in project conversation (not an independent device-lab test). 

**Reference build:** [GitHub Pages scanner source](../../docs/qr-scanner-poc/index.html), diagnostic UI v7, associated fix commit `f0c847d218dde899cb048bc4661eb55597f6d478`. POC source may evolve; tag/pin before production integration.

**Known observed detail:** Earlier Android test reported 2 devices (front + back), active `camera 0, facing back`, `facingMode=environment`, 480×640 resolution, no last error, and QR decode count 0. Subsequent confirmation indicates camera access works on Android/iOS. Do not infer from this alone that scanning/QR decode succeeds on both OS or that camera switching is proven.

**Verification status:**
- Android camera access: **PASS (user-reported)**.
- iOS camera access: **PASS (user-reported)**.
- Rear camera availability on Android: **PASS (previous diagnostic)**.
- Rear camera choice and front/rear switching on iOS: **TO VERIFY** (no iOS diagnostic log received here).
- Actual QR code decoding on both OS: **TO VERIFY** (user did not explicitly report decoded output).
- Permission denied, lifecycle cleanup and sustained repeat scans: **TO VERIFY**.
- GAS HTML Service embedded scanner: **NOT TESTED**. Standalone HTTPS Pages remains the POC delivery architecture.
- App login, authorization and backend contact lookup: **OUT OF POC / NOT BUILT**.

**Decision:** Proceed to the next integration design step while keeping device-specific QR decoding acceptance tests open. Do not mark full scanner POC complete until real QR decoding results and both-device test matrix are recorded.

---
## Why a separate POC is essential
Google Apps Script HTML Service is sandboxed in an iframe; the official Apps Script troubleshooting documentation explicitly identifies camera `getUserMedia()` permission-policy failures and advises hosting sensitive media capture on a separate domain/window. Therefore do not commit to a scanner embedded directly within GAS HTML Service until experimentally proven on target devices. Keep the Vue camera UI on approved stand-alone HTTPS origin for initial POC.

Sources:
- https://developers.google.com/apps-script/guides/support/troubleshooting
- https://developers.google.com/apps-script/guides/html/restrictions
- https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia
- https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/enumerateDevices

## POC scope and exclusions
**IN:** Vue 3 single-page test UI; HTTPS origin; rear-first camera; tap to toggle front/back; device picker where supported; QR decode; stop/restart stream cleanly; no repeated scans; visible result; error/retry; native-camera QR link test; mobile browser/device matrix.
**OUT:** production personal info, Google Sheets, real user identity, printing production QR stickers, camera photos stored in backend, full Super App login and role management.

## Frontend algorithm
1. Show user-visible 'เปิดกล้อง' action and camera privacy note.
2. Call `getUserMedia({audio:false,video:{facingMode:{ideal:"environment"}}})` over HTTPS on direct top-level page.
3. Display active stream in `<video autoplay playsinline muted>` and run one QR decoder loop (prototype candidate `html5-qrcode`, pinned version and evaluated bundle/security).
4. When user taps 'สลับกล้อง', stop all tracks of existing stream, stop decoder, then request `facingMode:"user"` or `"environment"` and resume.
5. After initial camera permission, call `enumerateDevices()` to discover available video input devices. Show device selector only if enumeration has usable alternatives; device names may be masked.
6. First valid QR result stops repeated decoding (do not repeatedly navigate/call). Accept only approved test prefix/URL host. Display decoded token only; do not follow arbitrary links.
7. Stop video tracks on unmount, page hide, route change and permission failures.
8. On denial, insecure origin, no camera or unsupported WebView, show explicit message and alternate 'เปิด QR ด้วยกล้องมือถือ' or 'กรอกทะเบียน' flow.

## Device test matrix
| Device/browser | Rear | Switch front/rear | Device selector | Denied permission | Native QR handoff |
|---|---|---|---|---|---|
| Android / Chrome (current) | test | test | test | test | test |
| iPhone / Safari (current) | test | test | test | test | test |
| Android / LINE WebView | exploratory | exploratory | exploratory | test | exploratory |
| iPhone / LINE WebView | exploratory | exploratory | exploratory | test | exploratory |

Test on *physical* phones (minimum one supported Android and one supported iPhone), both portrait and landscape where relevant, various brightness and QR sizes, permission retry, consecutive scans, screen locking and camera switching. Browser/device version and observed errors must be recorded, not assumed.

## Definition of POC PASS
- Android Chrome and iPhone Safari open preferred rear camera and decode valid QR.
- Front/rear switch works without stale tracks or freezing on two chosen test devices; if platform cannot support switch reliably, document scope change to rear-only.
- Safe failure when denied; no camera stays active after leaving page.
- Valid QR yields a single correct result and no repeated navigation.
- QR from the phone's native camera opens test HTTPS destination.
- GAS embedded scanner is **not** considered proven; hosting is separate unless tested otherwise.

## Decision gate
If rear-only works across target devices but switching does not, choose **rear-only** for production v1 and retain manual plate lookup. If QR scanning on stand-alone HTTPS works but embedded GAS does not, use standalone Vue frontend plus secured GAS adapter/backend approach rather than trying to bypass browser permission policy. Authentication and sensitive contact lookup require a separate security integration gate.

## Proposed architecture
Standalone HTTPS Vue + Pinia + Vue Router + Tailwind CSS + DaisyUI (POC camera) -> decoded QR reference -> later authenticated backend adapter -> GAS + Google Sheets; photos on private Google Drive with controlled access. Never expose a public GAS endpoint returning contact details based solely on an unguessable QR reference.
